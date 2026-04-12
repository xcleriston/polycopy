"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopTradeExecutor = void 0;
const env_1 = require("../config/env");
const userHistory_1 = require("../models/userHistory");
const fetchData_1 = __importDefault(require("../utils/fetchData"));
const getMyBalance_1 = __importDefault(require("../utils/getMyBalance"));
const postOrder_1 = __importDefault(require("../utils/postOrder"));
const logger_1 = __importDefault(require("../utils/logger"));
const telegram_1 = __importDefault(require("../utils/telegram"));
const USER_ADDRESSES = env_1.ENV.USER_ADDRESSES;
const RETRY_LIMIT = env_1.ENV.RETRY_LIMIT;
const PROXY_WALLET = env_1.ENV.PROXY_WALLET;
const TRADE_AGGREGATION_ENABLED = env_1.ENV.TRADE_AGGREGATION_ENABLED;
const TRADE_AGGREGATION_WINDOW_SECONDS = env_1.ENV.TRADE_AGGREGATION_WINDOW_SECONDS;
const TRADE_AGGREGATION_MIN_TOTAL_USD = 1.0; // Polymarket minimum
const PREVIEW_MODE = process.env.PREVIEW_MODE === 'true';
// Daily loss tracking
let dailyStartBalance = null;
let dailyStartDate = '';
let killSwitchTriggered = false;
const DAILY_LOSS_CAP_PCT = parseFloat(process.env.DAILY_LOSS_CAP_PCT || '20'); // default 20%
const checkDailyLoss = () => __awaiter(void 0, void 0, void 0, function* () {
    const today = new Date().toISOString().split('T')[0];
    const currentBalance = yield (0, getMyBalance_1.default)(PROXY_WALLET);
    if (dailyStartDate !== today) {
        dailyStartDate = today;
        dailyStartBalance = currentBalance;
        logger_1.default.info(`📅 Daily balance reset: $${currentBalance.toFixed(2)}`);
    }
    if (dailyStartBalance !== null && dailyStartBalance > 0) {
        const lossPct = ((dailyStartBalance - currentBalance) / dailyStartBalance) * 100;
        if (lossPct >= DAILY_LOSS_CAP_PCT) {
            logger_1.default.error(`🛑 KILL SWITCH: Daily loss ${lossPct.toFixed(1)}% exceeds ${DAILY_LOSS_CAP_PCT}% cap. Trading halted.`);
            killSwitchTriggered = true;
            telegram_1.default.killSwitch(lossPct);
            return false;
        }
    }
    return true;
});
// Create activity models for each user
const userActivityModels = USER_ADDRESSES.map((address) => ({
    address,
    model: (0, userHistory_1.getUserActivityModel)(address),
}));
// Buffer for aggregating trades
const tradeAggregationBuffer = new Map();
const readTempTrades = () => __awaiter(void 0, void 0, void 0, function* () {
    const allTrades = [];
    for (const { address, model } of userActivityModels) {
        // Only get trades that haven't been processed yet (bot: false AND botExcutedTime: 0)
        // This prevents processing the same trade multiple times
        const trades = yield model
            .find({
            $and: [{ type: 'TRADE' }, { bot: false }, { botExcutedTime: 0 }],
        })
            .exec();
        const tradesWithUser = trades.map((trade) => (Object.assign(Object.assign({}, trade.toObject()), { userAddress: address })));
        allTrades.push(...tradesWithUser);
    }
    return allTrades;
});
/**
 * Generate a unique key for trade aggregation based on user, market, side
 */
const getAggregationKey = (trade) => {
    return `${trade.userAddress}:${trade.conditionId}:${trade.asset}:${trade.side}`;
};
/**
 * Add trade to aggregation buffer or update existing aggregation
 */
const addToAggregationBuffer = (trade) => {
    const key = getAggregationKey(trade);
    const existing = tradeAggregationBuffer.get(key);
    const now = Date.now();
    if (existing) {
        // Update existing aggregation
        existing.trades.push(trade);
        existing.totalUsdcSize += trade.usdcSize;
        // Recalculate weighted average price
        const totalValue = existing.trades.reduce((sum, t) => sum + t.usdcSize * t.price, 0);
        existing.averagePrice = totalValue / existing.totalUsdcSize;
        existing.lastTradeTime = now;
    }
    else {
        // Create new aggregation
        tradeAggregationBuffer.set(key, {
            userAddress: trade.userAddress,
            conditionId: trade.conditionId,
            asset: trade.asset,
            side: trade.side || 'BUY',
            slug: trade.slug,
            eventSlug: trade.eventSlug,
            trades: [trade],
            totalUsdcSize: trade.usdcSize,
            averagePrice: trade.price,
            firstTradeTime: now,
            lastTradeTime: now,
        });
    }
};
/**
 * Check buffer and return ready aggregated trades
 * Trades are ready if:
 * 1. Total size >= minimum AND
 * 2. Time window has passed since first trade
 */
const getReadyAggregatedTrades = () => {
    const ready = [];
    const now = Date.now();
    const windowMs = TRADE_AGGREGATION_WINDOW_SECONDS * 1000;
    for (const [key, agg] of tradeAggregationBuffer.entries()) {
        const timeElapsed = now - agg.firstTradeTime;
        // Check if aggregation is ready
        if (timeElapsed >= windowMs) {
            if (agg.totalUsdcSize >= TRADE_AGGREGATION_MIN_TOTAL_USD) {
                // Aggregation meets minimum and window passed - ready to execute
                ready.push(agg);
            }
            else {
                // Window passed but total too small - mark individual trades as skipped
                logger_1.default.info(`Trade aggregation for ${agg.userAddress} on ${agg.slug || agg.asset}: $${agg.totalUsdcSize.toFixed(2)} total from ${agg.trades.length} trades below minimum ($${TRADE_AGGREGATION_MIN_TOTAL_USD}) - skipping`);
                // Mark all trades in this aggregation as processed (bot: true)
                for (const trade of agg.trades) {
                    const UserActivity = (0, userHistory_1.getUserActivityModel)(trade.userAddress);
                    UserActivity.updateOne({ _id: trade._id }, { bot: true }).exec();
                }
            }
            // Remove from buffer either way
            tradeAggregationBuffer.delete(key);
        }
    }
    return ready;
};
const doTrading = (clobClient, trades) => __awaiter(void 0, void 0, void 0, function* () {
    for (const trade of trades) {
        // Kill switch check
        if (killSwitchTriggered) {
            logger_1.default.warning('🛑 Kill switch active — skipping trade');
            return;
        }
        if (!(yield checkDailyLoss()))
            return;
        // Mark trade as being processed immediately to prevent duplicate processing
        const UserActivity = (0, userHistory_1.getUserActivityModel)(trade.userAddress);
        yield UserActivity.updateOne({ _id: trade._id }, { $set: { botExcutedTime: 1 } });
        logger_1.default.trade(trade.userAddress, trade.side || 'UNKNOWN', {
            asset: trade.asset,
            side: trade.side,
            amount: trade.usdcSize,
            price: trade.price,
            slug: trade.slug,
            eventSlug: trade.eventSlug,
            transactionHash: trade.transactionHash,
        });
        // Preview mode: log but don't execute
        if (PREVIEW_MODE) {
            logger_1.default.info('🔍 PREVIEW MODE — trade logged but NOT executed');
            yield UserActivity.updateOne({ _id: trade._id }, { bot: true });
            logger_1.default.separator();
            continue;
        }
        const my_positions = yield (0, fetchData_1.default)(`https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`);
        const user_positions = yield (0, fetchData_1.default)(`https://data-api.polymarket.com/positions?user=${trade.userAddress}`);
        const my_position = my_positions.find((position) => position.conditionId === trade.conditionId);
        const user_position = user_positions.find((position) => position.conditionId === trade.conditionId);
        // Get USDC balance
        const my_balance = yield (0, getMyBalance_1.default)(PROXY_WALLET);
        // Calculate trader's total portfolio value from positions
        const user_balance = user_positions.reduce((total, pos) => {
            return total + (pos.currentValue || 0);
        }, 0);
        logger_1.default.balance(my_balance, user_balance, trade.userAddress);
        // Execute the trade
        yield (0, postOrder_1.default)(clobClient, trade.side === 'BUY' ? 'buy' : 'sell', my_position, user_position, trade, my_balance, trade.userAddress);
        logger_1.default.separator();
    }
});
/**
 * Execute aggregated trades
 */
const doAggregatedTrading = (clobClient, aggregatedTrades) => __awaiter(void 0, void 0, void 0, function* () {
    for (const agg of aggregatedTrades) {
        logger_1.default.header(`📊 AGGREGATED TRADE (${agg.trades.length} trades combined)`);
        logger_1.default.info(`Market: ${agg.slug || agg.asset}`);
        logger_1.default.info(`Side: ${agg.side}`);
        logger_1.default.info(`Total volume: $${agg.totalUsdcSize.toFixed(2)}`);
        logger_1.default.info(`Average price: $${agg.averagePrice.toFixed(4)}`);
        // Mark all individual trades as being processed
        for (const trade of agg.trades) {
            const UserActivity = (0, userHistory_1.getUserActivityModel)(trade.userAddress);
            yield UserActivity.updateOne({ _id: trade._id }, { $set: { botExcutedTime: 1 } });
        }
        const my_positions = yield (0, fetchData_1.default)(`https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`);
        const user_positions = yield (0, fetchData_1.default)(`https://data-api.polymarket.com/positions?user=${agg.userAddress}`);
        const my_position = my_positions.find((position) => position.conditionId === agg.conditionId);
        const user_position = user_positions.find((position) => position.conditionId === agg.conditionId);
        // Get USDC balance
        const my_balance = yield (0, getMyBalance_1.default)(PROXY_WALLET);
        // Calculate trader's total portfolio value from positions
        const user_balance = user_positions.reduce((total, pos) => {
            return total + (pos.currentValue || 0);
        }, 0);
        logger_1.default.balance(my_balance, user_balance, agg.userAddress);
        // Create a synthetic trade object for postOrder using aggregated values
        const syntheticTrade = Object.assign(Object.assign({}, agg.trades[0]), { usdcSize: agg.totalUsdcSize, price: agg.averagePrice, side: agg.side });
        // Execute the aggregated trade
        yield (0, postOrder_1.default)(clobClient, agg.side === 'BUY' ? 'buy' : 'sell', my_position, user_position, syntheticTrade, my_balance, agg.userAddress);
        logger_1.default.separator();
    }
});
// Track if executor should continue running
let isRunning = true;
/**
 * Stop the trade executor gracefully
 */
const stopTradeExecutor = () => {
    isRunning = false;
    logger_1.default.info('Trade executor shutdown requested...');
};
exports.stopTradeExecutor = stopTradeExecutor;
const tradeExecutor = (clobClient) => __awaiter(void 0, void 0, void 0, function* () {
    logger_1.default.success(`Trade executor ready for ${USER_ADDRESSES.length} trader(s)`);
    if (telegram_1.default.isEnabled()) {
        logger_1.default.info('📱 Telegram notifications enabled');
    }
    if (PREVIEW_MODE) {
        logger_1.default.warning('🔍 PREVIEW MODE ACTIVE — trades will be logged but NOT executed');
    }
    logger_1.default.info(`🛡️ Daily loss cap: ${DAILY_LOSS_CAP_PCT}% (set DAILY_LOSS_CAP_PCT to adjust)`);
    if (TRADE_AGGREGATION_ENABLED) {
        logger_1.default.info(`Trade aggregation enabled: ${TRADE_AGGREGATION_WINDOW_SECONDS}s window, $${TRADE_AGGREGATION_MIN_TOTAL_USD} minimum`);
    }
    let lastCheck = Date.now();
    while (isRunning) {
        const trades = yield readTempTrades();
        if (TRADE_AGGREGATION_ENABLED) {
            // Process with aggregation logic
            if (trades.length > 0) {
                logger_1.default.clearLine();
                logger_1.default.info(`📥 ${trades.length} new trade${trades.length > 1 ? 's' : ''} detected`);
                // Add trades to aggregation buffer
                for (const trade of trades) {
                    // Only aggregate BUY trades below minimum threshold
                    if (trade.side === 'BUY' && trade.usdcSize < TRADE_AGGREGATION_MIN_TOTAL_USD) {
                        logger_1.default.info(`Adding $${trade.usdcSize.toFixed(2)} ${trade.side} trade to aggregation buffer for ${trade.slug || trade.asset}`);
                        addToAggregationBuffer(trade);
                    }
                    else {
                        // Execute large trades immediately (not aggregated)
                        logger_1.default.clearLine();
                        logger_1.default.header(`⚡ IMMEDIATE TRADE (above threshold)`);
                        yield doTrading(clobClient, [trade]);
                    }
                }
                lastCheck = Date.now();
            }
            // Check for ready aggregated trades
            const readyAggregations = getReadyAggregatedTrades();
            if (readyAggregations.length > 0) {
                logger_1.default.clearLine();
                logger_1.default.header(`⚡ ${readyAggregations.length} AGGREGATED TRADE${readyAggregations.length > 1 ? 'S' : ''} READY`);
                yield doAggregatedTrading(clobClient, readyAggregations);
                lastCheck = Date.now();
            }
            // Update waiting message
            if (trades.length === 0 && readyAggregations.length === 0) {
                if (Date.now() - lastCheck > 300) {
                    const bufferedCount = tradeAggregationBuffer.size;
                    if (bufferedCount > 0) {
                        logger_1.default.waiting(USER_ADDRESSES.length, `${bufferedCount} trade group(s) pending`);
                    }
                    else {
                        logger_1.default.waiting(USER_ADDRESSES.length);
                    }
                    lastCheck = Date.now();
                }
            }
        }
        else {
            // Original non-aggregation logic
            if (trades.length > 0) {
                logger_1.default.clearLine();
                logger_1.default.header(`⚡ ${trades.length} NEW TRADE${trades.length > 1 ? 'S' : ''} TO COPY`);
                yield doTrading(clobClient, trades);
                lastCheck = Date.now();
            }
            else {
                // Update waiting message every 300ms for smooth animation
                if (Date.now() - lastCheck > 300) {
                    logger_1.default.waiting(USER_ADDRESSES.length);
                    lastCheck = Date.now();
                }
            }
        }
        if (!isRunning)
            break;
        yield new Promise((resolve) => setTimeout(resolve, 300));
    }
    logger_1.default.info('Trade executor stopped');
});
exports.default = tradeExecutor;
