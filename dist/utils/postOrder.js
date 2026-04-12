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
const clob_client_1 = require("@polymarket/clob-client");
const env_1 = require("../config/env");
const userHistory_1 = require("../models/userHistory");
const logger_1 = __importDefault(require("./logger"));
const copyStrategy_1 = require("../config/copyStrategy");
const RETRY_LIMIT = env_1.ENV.RETRY_LIMIT;
const COPY_STRATEGY_CONFIG = env_1.ENV.COPY_STRATEGY_CONFIG;
const SLIPPAGE_TOLERANCE = parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.05');
// Legacy parameters (for backward compatibility in SELL logic)
const TRADE_MULTIPLIER = env_1.ENV.TRADE_MULTIPLIER;
const COPY_PERCENTAGE = env_1.ENV.COPY_PERCENTAGE;
// Polymarket minimum order sizes
const MIN_ORDER_SIZE_USD = 1.0; // Minimum order size in USD for BUY orders
const MIN_ORDER_SIZE_TOKENS = 1.0; // Minimum order size in tokens for SELL/MERGE orders
const extractOrderError = (response) => {
    if (!response) {
        return undefined;
    }
    if (typeof response === 'string') {
        return response;
    }
    if (typeof response === 'object') {
        const data = response;
        const directError = data.error;
        if (typeof directError === 'string') {
            return directError;
        }
        if (typeof directError === 'object' && directError !== null) {
            const nested = directError;
            if (typeof nested.error === 'string') {
                return nested.error;
            }
            if (typeof nested.message === 'string') {
                return nested.message;
            }
        }
        if (typeof data.errorMsg === 'string') {
            return data.errorMsg;
        }
        if (typeof data.message === 'string') {
            return data.message;
        }
    }
    return undefined;
};
const isInsufficientBalanceOrAllowanceError = (message) => {
    if (!message) {
        return false;
    }
    const lower = message.toLowerCase();
    return lower.includes('not enough balance') || lower.includes('allowance');
};
const postOrder = (clobClient, condition, my_position, user_position, trade, my_balance, userAddress) => __awaiter(void 0, void 0, void 0, function* () {
    const UserActivity = (0, userHistory_1.getUserActivityModel)(userAddress);
    if (condition === 'buy') {
        //Buy strategy
        logger_1.default.info('Executing BUY strategy...');
        logger_1.default.info(`Your balance: $${my_balance.toFixed(2)}`);
        logger_1.default.info(`Trader bought: $${trade.usdcSize.toFixed(2)}`);
        // Get current position size for position limit checks
        const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;
        // Use new copy strategy system
        const orderCalc = (0, copyStrategy_1.calculateOrderSize)(COPY_STRATEGY_CONFIG, trade.usdcSize, my_balance, currentPositionValue);
        // Log the calculation reasoning
        logger_1.default.info(`📊 ${orderCalc.reasoning}`);
        // Check if order should be executed
        if (orderCalc.finalAmount === 0) {
            logger_1.default.warning(`❌ Cannot execute: ${orderCalc.reasoning}`);
            if (orderCalc.belowMinimum) {
                logger_1.default.warning(`💡 Increase COPY_SIZE or wait for larger trades`);
            }
            yield UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }
        let remaining = orderCalc.finalAmount;
        let retry = 0;
        let abortDueToFunds = false;
        let totalBoughtTokens = 0; // Track total tokens bought for this trade
        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = yield clobClient.getOrderBook(trade.asset);
            if (!orderBook.asks || orderBook.asks.length === 0) {
                logger_1.default.warning('No asks available in order book');
                yield UserActivity.updateOne({ _id: trade._id }, { bot: true });
                break;
            }
            const minPriceAsk = orderBook.asks.reduce((min, ask) => {
                return parseFloat(ask.price) < parseFloat(min.price) ? ask : min;
            }, orderBook.asks[0]);
            logger_1.default.info(`Best ask: ${minPriceAsk.size} @ $${minPriceAsk.price}`);
            if (parseFloat(minPriceAsk.price) - SLIPPAGE_TOLERANCE > trade.price) {
                logger_1.default.warning(`Price slippage $${(parseFloat(minPriceAsk.price) - trade.price).toFixed(4)} exceeds tolerance $${SLIPPAGE_TOLERANCE} - skipping trade`);
                yield UserActivity.updateOne({ _id: trade._id }, { bot: true });
                break;
            }
            // Check if remaining amount is below minimum before creating order
            if (remaining < MIN_ORDER_SIZE_USD) {
                logger_1.default.info(`Remaining amount ($${remaining.toFixed(2)}) below minimum - completing trade`);
                yield UserActivity.updateOne({ _id: trade._id }, { bot: true, myBoughtSize: totalBoughtTokens });
                break;
            }
            const maxOrderSize = parseFloat(minPriceAsk.size) * parseFloat(minPriceAsk.price);
            const orderSize = Math.min(remaining, maxOrderSize);
            const order_arges = {
                side: clob_client_1.Side.BUY,
                tokenID: trade.asset,
                amount: orderSize,
                price: parseFloat(minPriceAsk.price),
            };
            logger_1.default.info(`Creating order: $${orderSize.toFixed(2)} @ $${minPriceAsk.price} (Balance: $${my_balance.toFixed(2)})`);
            // Order args logged internally
            const signedOrder = yield clobClient.createMarketOrder(order_arges);
            const resp = yield clobClient.postOrder(signedOrder, clob_client_1.OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                const tokensBought = order_arges.amount / order_arges.price;
                totalBoughtTokens += tokensBought;
                logger_1.default.orderResult(true, `Bought $${order_arges.amount.toFixed(2)} at $${order_arges.price} (${tokensBought.toFixed(2)} tokens)`);
                remaining -= order_arges.amount;
            }
            else {
                const errorMessage = extractOrderError(resp);
                if (isInsufficientBalanceOrAllowanceError(errorMessage)) {
                    abortDueToFunds = true;
                    logger_1.default.warning(`Order rejected: ${errorMessage || 'Insufficient balance or allowance'}`);
                    logger_1.default.warning('Skipping remaining attempts. Top up funds or run `npm run check-allowance` before retrying.');
                    break;
                }
                retry += 1;
                logger_1.default.warning(`Order failed (attempt ${retry}/${RETRY_LIMIT})${errorMessage ? ` - ${errorMessage}` : ''}`);
            }
        }
        if (abortDueToFunds) {
            yield UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: RETRY_LIMIT, myBoughtSize: totalBoughtTokens });
            return;
        }
        if (retry >= RETRY_LIMIT) {
            yield UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: retry, myBoughtSize: totalBoughtTokens });
        }
        else {
            yield UserActivity.updateOne({ _id: trade._id }, { bot: true, myBoughtSize: totalBoughtTokens });
        }
        // Log the tracked purchase for later sell reference
        if (totalBoughtTokens > 0) {
            logger_1.default.info(`📝 Tracked purchase: ${totalBoughtTokens.toFixed(2)} tokens for future sell calculations`);
        }
    }
    else if (condition === 'sell') {
        //Sell strategy
        logger_1.default.info('Executing SELL strategy...');
        let remaining = 0;
        if (!my_position) {
            logger_1.default.warning('No position to sell');
            yield UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }
        // Get all previous BUY trades for this asset to calculate total bought
        const previousBuys = yield UserActivity.find({
            asset: trade.asset,
            conditionId: trade.conditionId,
            side: 'BUY',
            bot: true,
            myBoughtSize: { $exists: true, $gt: 0 },
        }).exec();
        const totalBoughtTokens = previousBuys.reduce((sum, buy) => sum + (buy.myBoughtSize || 0), 0);
        if (totalBoughtTokens > 0) {
            logger_1.default.info(`📊 Found ${previousBuys.length} previous purchases: ${totalBoughtTokens.toFixed(2)} tokens bought`);
        }
        if (!user_position) {
            // Trader sold entire position - we sell entire position too
            remaining = my_position.size;
            logger_1.default.info(`Trader closed entire position → Selling all your ${remaining.toFixed(2)} tokens`);
        }
        else {
            // Calculate the % of position the trader is selling
            const trader_sell_percent = trade.size / (user_position.size + trade.size);
            const trader_position_before = user_position.size + trade.size;
            logger_1.default.info(`Position comparison: Trader has ${trader_position_before.toFixed(2)} tokens, You have ${my_position.size.toFixed(2)} tokens`);
            logger_1.default.info(`Trader selling: ${trade.size.toFixed(2)} tokens (${(trader_sell_percent * 100).toFixed(2)}% of their position)`);
            // Use tracked bought tokens if available, otherwise fallback to current position
            let baseSellSize;
            if (totalBoughtTokens > 0) {
                baseSellSize = totalBoughtTokens * trader_sell_percent;
                logger_1.default.info(`Calculating from tracked purchases: ${totalBoughtTokens.toFixed(2)} × ${(trader_sell_percent * 100).toFixed(2)}% = ${baseSellSize.toFixed(2)} tokens`);
            }
            else {
                baseSellSize = my_position.size * trader_sell_percent;
                logger_1.default.warning(`No tracked purchases found, using current position: ${my_position.size.toFixed(2)} × ${(trader_sell_percent * 100).toFixed(2)}% = ${baseSellSize.toFixed(2)} tokens`);
            }
            // Apply tiered or single multiplier based on trader's order size (symmetrical with BUY logic)
            const multiplier = (0, copyStrategy_1.getTradeMultiplier)(COPY_STRATEGY_CONFIG, trade.usdcSize);
            remaining = baseSellSize * multiplier;
            if (multiplier !== 1.0) {
                logger_1.default.info(`Applying ${multiplier}x multiplier (based on trader's $${trade.usdcSize.toFixed(2)} order): ${baseSellSize.toFixed(2)} → ${remaining.toFixed(2)} tokens`);
            }
        }
        // Check minimum order size
        if (remaining < MIN_ORDER_SIZE_TOKENS) {
            logger_1.default.warning(`❌ Cannot execute: Sell amount ${remaining.toFixed(2)} tokens below minimum (${MIN_ORDER_SIZE_TOKENS} token)`);
            logger_1.default.warning(`💡 This happens when position sizes are too small or mismatched`);
            yield UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }
        // Cap sell amount to available position size
        if (remaining > my_position.size) {
            logger_1.default.warning(`⚠️  Calculated sell ${remaining.toFixed(2)} tokens > Your position ${my_position.size.toFixed(2)} tokens`);
            logger_1.default.warning(`Capping to maximum available: ${my_position.size.toFixed(2)} tokens`);
            remaining = my_position.size;
        }
        let retry = 0;
        let abortDueToFunds = false;
        let totalSoldTokens = 0; // Track total tokens sold
        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = yield clobClient.getOrderBook(trade.asset);
            if (!orderBook.bids || orderBook.bids.length === 0) {
                yield UserActivity.updateOne({ _id: trade._id }, { bot: true });
                logger_1.default.warning('No bids available in order book');
                break;
            }
            const maxPriceBid = orderBook.bids.reduce((max, bid) => {
                return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
            }, orderBook.bids[0]);
            logger_1.default.info(`Best bid: ${maxPriceBid.size} @ $${maxPriceBid.price}`);
            // Check if remaining amount is below minimum before creating order
            if (remaining < MIN_ORDER_SIZE_TOKENS) {
                logger_1.default.info(`Remaining amount (${remaining.toFixed(2)} tokens) below minimum - completing trade`);
                yield UserActivity.updateOne({ _id: trade._id }, { bot: true });
                break;
            }
            const sellAmount = Math.min(remaining, parseFloat(maxPriceBid.size));
            // Final check: don't create orders below minimum
            if (sellAmount < MIN_ORDER_SIZE_TOKENS) {
                logger_1.default.info(`Order amount (${sellAmount.toFixed(2)} tokens) below minimum - completing trade`);
                yield UserActivity.updateOne({ _id: trade._id }, { bot: true });
                break;
            }
            const order_arges = {
                side: clob_client_1.Side.SELL,
                tokenID: trade.asset,
                amount: sellAmount,
                price: parseFloat(maxPriceBid.price),
            };
            // Order args logged internally
            const signedOrder = yield clobClient.createMarketOrder(order_arges);
            const resp = yield clobClient.postOrder(signedOrder, clob_client_1.OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                totalSoldTokens += order_arges.amount;
                logger_1.default.orderResult(true, `Sold ${order_arges.amount} tokens at $${order_arges.price}`);
                remaining -= order_arges.amount;
            }
            else {
                const errorMessage = extractOrderError(resp);
                if (isInsufficientBalanceOrAllowanceError(errorMessage)) {
                    abortDueToFunds = true;
                    logger_1.default.warning(`Order rejected: ${errorMessage || 'Insufficient balance or allowance'}`);
                    logger_1.default.warning('Skipping remaining attempts. Top up funds or run `npm run check-allowance` before retrying.');
                    break;
                }
                retry += 1;
                logger_1.default.warning(`Order failed (attempt ${retry}/${RETRY_LIMIT})${errorMessage ? ` - ${errorMessage}` : ''}`);
            }
        }
        // Update tracked purchases after successful sell
        if (totalSoldTokens > 0 && totalBoughtTokens > 0) {
            const sellPercentage = totalSoldTokens / totalBoughtTokens;
            if (sellPercentage >= 0.99) {
                // Sold essentially all tracked tokens - clear tracking
                yield UserActivity.updateMany({
                    asset: trade.asset,
                    conditionId: trade.conditionId,
                    side: 'BUY',
                    bot: true,
                    myBoughtSize: { $exists: true, $gt: 0 },
                }, { $set: { myBoughtSize: 0 } });
                logger_1.default.info(`🧹 Cleared purchase tracking (sold ${(sellPercentage * 100).toFixed(1)}% of position)`);
            }
            else {
                // Partial sell - reduce tracked purchases proportionally
                for (const buy of previousBuys) {
                    const newSize = (buy.myBoughtSize || 0) * (1 - sellPercentage);
                    yield UserActivity.updateOne({ _id: buy._id }, { $set: { myBoughtSize: newSize } });
                }
                logger_1.default.info(`📝 Updated purchase tracking (sold ${(sellPercentage * 100).toFixed(1)}% of tracked position)`);
            }
        }
        if (abortDueToFunds) {
            yield UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: RETRY_LIMIT });
            return;
        }
        if (retry >= RETRY_LIMIT) {
            yield UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: retry });
        }
        else {
            yield UserActivity.updateOne({ _id: trade._id }, { bot: true });
        }
    }
    else {
        logger_1.default.error(`Unknown condition: ${condition}`);
    }
});
exports.default = postOrder;
