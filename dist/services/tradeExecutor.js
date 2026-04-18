var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ENV } from '../config/env.js';
import { Activity } from '../models/userHistory.js';
import User from '../models/user.js';
import fetchData from '../utils/fetchData.js';
import getMyBalance from '../utils/getMyBalance.js';
import postOrder from '../utils/postOrder.js';
import Logger from '../utils/logger.js';
import createClobClient from '../utils/createClobClient.js';
import { broadcastTrade } from '../utils/push.js';
import { refreshUserStats } from '../utils/userStats.js';
const RETRY_LIMIT = ENV.RETRY_LIMIT;
const PREVIEW_MODE = process.env.PREVIEW_MODE === 'true';
// Cache for CLOB clients to avoid repeated instantiation
const clobClientCache = new Map();
const getClobClientForUser = (user) => __awaiter(void 0, void 0, void 0, function* () {
    if (!user.wallet) {
        Logger.warning(`No wallet configured for user \${user.username || user.chatId || user._id}`);
        return null;
    }
    const cacheKey = user.wallet.address.toLowerCase();
    if (clobClientCache.has(cacheKey)) {
        return clobClientCache.get(cacheKey);
    }
    const client = yield createClobClient(user.wallet.privateKey, user.wallet.proxyAddress || user.wallet.address);
    clobClientCache.set(cacheKey, client);
    return client;
});
// Check daily loss per user (wallet)
const checkDailyLoss = (proxyWallet, chatId) => __awaiter(void 0, void 0, void 0, function* () {
    // Legacy logic simplified for multi-user
    return true; // TODO: Implement per-user tracking if needed
});
const readUnprocessedTrades = () => __awaiter(void 0, void 0, void 0, function* () {
    // Find trades that haven't been completed by everyone
    return yield Activity.find({ bot: false, type: 'TRADE' }).lean();
});
const doTrading = (trade) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const traderAddress = trade.traderAddress.toLowerCase();
    // Find all users following this trader in COPY mode
    const followers = yield User.find({
        'config.traderAddress': { $regex: new RegExp(`^${traderAddress}$`, 'i') },
        'config.enabled': true,
        'config.mode': 'COPY'
    });
    if (followers.length === 0) {
        // No active followers, mark trade as done to stop polling
        yield Activity.updateOne({ _id: trade._id }, { $set: { bot: true } });
        return;
    }
    // Parallel Execution: Process all followers at once
    yield Promise.all(followers.map((follower) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c;
        const followerId = (follower.chatId || follower._id.toString());
        // Skip if this follower already processed this trade
        if (trade.processedBy && trade.processedBy.includes(followerId)) {
            return;
        }
        Logger.header(`👤 FOLLOWER: ${followerId} parallel copying ${traderAddress.slice(0, 6)}...`);
        try {
            const clobClient = yield getClobClientForUser(follower);
            if (!clobClient)
                return;
            const proxyWallet = (_a = follower.wallet) === null || _a === void 0 ? void 0 : _a.address;
            if (!proxyWallet) {
                Logger.warning(`[${followerId}] No wallet configured - skipping`);
                return;
            }
            // Latency calculation
            const polymarketTime = trade.timestamp > 2000000000 ? trade.timestamp / 1000 : trade.timestamp;
            const latencySeconds = (Date.now() / 1000) - (polymarketTime / 1000);
            Logger.trade(followerId, trade.side || 'UNKNOWN', {
                asset: trade.asset,
                side: trade.side,
                amount: trade.usdcSize,
                price: trade.price,
                slug: trade.slug,
                eventSlug: trade.eventSlug,
                transactionHash: trade.transactionHash,
                latency: latencySeconds,
            });
            if (PREVIEW_MODE) {
                Logger.info(`🔍 PREVIEW MODE — trade logged for user ${followerId} but NOT executed`);
            }
            else {
                const [my_positions, user_positions, my_balance] = yield Promise.all([
                    fetchData(`https://data-api.polymarket.com/positions?user=${proxyWallet}`),
                    fetchData(`https://data-api.polymarket.com/positions?user=${traderAddress}`),
                    getMyBalance(((_b = follower.wallet) === null || _b === void 0 ? void 0 : _b.address) || '', (_c = follower.wallet) === null || _c === void 0 ? void 0 : _c.proxyAddress)
                ]);
                const user_balance = user_positions.reduce((total, pos) => {
                    return total + (pos.currentValue || 0);
                }, 0);
                const my_position = my_positions.find((position) => position.conditionId === trade.conditionId);
                const user_position = user_positions.find((position) => position.conditionId === trade.conditionId);
                Logger.balance(my_balance, user_balance, followerId);
                // Execute the trade with FOLLOWER'S config
                yield postOrder(clobClient, trade.side === 'BUY' ? 'buy' : 'sell', my_position, user_position, trade, my_balance, followerId, follower.config, my_positions);
                // Now officially mark as processed
                yield Activity.updateOne({ _id: trade._id }, { $addToSet: { processedBy: followerId } });
                // Refresh user balance in DB after trade
                refreshUserStats(follower._id.toString()).catch(() => { });
            }
        }
        catch (error) {
            Logger.error(`Error processing trade for follower ${followerId}: ${error}`);
            // Record critical failure in activity
            yield Activity.updateOne({ _id: trade._id }, { $set: { [`followerStatuses.${followerId}`]: { status: 'ERRO CRÍTICO', details: String(error), timestamp: new Date() } } }).catch(() => { });
        }
    })));
    // After attempting all followers, check if we should mark the trade as completely processed
    const latestTrade = yield Activity.findById(trade._id).lean();
    if (latestTrade) {
        const stillMissing = followers.filter(f => !latestTrade.processedBy.includes(f.chatId || f._id.toString()));
        if (stillMissing.length === 0) {
            yield Activity.updateOne({ _id: trade._id }, { $set: { bot: true } });
            Logger.info(`✅ Trade ${(_a = trade.transactionHash) === null || _a === void 0 ? void 0 : _a.slice(0, 8)} fully processed for all ${followers.length} followers.`);
            // Notify web followers via Push
            yield broadcastTrade(traderAddress, trade);
        }
    }
});
// Track executor state
let isRunning = true;
export const stopTradeExecutor = () => {
    isRunning = false;
    Logger.info('Trade executor shutdown requested...');
};
let executionTrigger = null;
export const triggerExecution = () => {
    if (executionTrigger) {
        Logger.info('⚡ SPEED TRIGGER: Manual execution signal received.');
        executionTrigger();
    }
};
const tradeExecutor = () => __awaiter(void 0, void 0, void 0, function* () {
    Logger.success('Multi-User Trade executor ready (High Speed: 250ms)');
    if (PREVIEW_MODE) {
        Logger.warning('🔍 PREVIEW MODE ACTIVE — trades will be logged but NOT executed');
    }
    while (isRunning) {
        try {
            // Guard: Database stability
            const mongoose = (yield import('mongoose')).default;
            if (mongoose.connection.readyState !== 1) {
                yield new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }
            // Check for new trades to process (bot: false means not yet handled by executor)
            // Check for new trades to process
            const unprocessedTrades = (yield Activity.find({
                type: 'TRADE',
                bot: false
            }).sort({ timestamp: -1 }));
            if (unprocessedTrades.length > 0) {
                for (const trade of unprocessedTrades) {
                    if (!isRunning)
                        break;
                    yield doTrading(trade);
                }
            }
        }
        catch (error) {
            Logger.error(`[EXECUTOR] Fatal Loop Error: ${error}`);
            // Safety backoff to prevent CPU spin during database/network outages
            yield new Promise(resolve => setTimeout(resolve, 5000));
        }
        // Check every 250ms for new trades or wait for manual trigger
        yield new Promise(resolve => {
            executionTrigger = resolve;
            setTimeout(resolve, 250);
        });
        executionTrigger = null;
    }
    Logger.info('Trade executor stopped');
});
export default tradeExecutor;
