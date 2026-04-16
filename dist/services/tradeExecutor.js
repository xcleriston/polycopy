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
    var _a, _b, _c, _d;
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
    for (const follower of followers) {
        const followerId = (follower.chatId || follower._id.toString());
        // Skip if this follower already processed this trade
        if (trade.processedBy && trade.processedBy.includes(followerId)) {
            continue;
        }
        Logger.header(`👤 FOLLOWER: ${followerId} copying ${traderAddress.slice(0, 6)}...`);
        try {
            const clobClient = yield getClobClientForUser(follower);
            if (!clobClient)
                continue;
            const proxyWallet = (_a = follower.wallet) === null || _a === void 0 ? void 0 : _a.address;
            if (!proxyWallet) {
                Logger.warning(`[${followerId}] No wallet configured - skipping`);
                continue;
            }
            // Mark user as processing immediately (atomic-ish update)
            yield Activity.updateOne({ _id: trade._id }, { $addToSet: { processedBy: followerId } });
            // Calculate E2E Latency
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
                yield postOrder(clobClient, trade.side === 'BUY' ? 'buy' : 'sell', my_position, user_position, trade, my_balance, followerId, follower.config, // Pass individual user config
                my_positions // Pass all positions for exposure calculation
                );
            }
        }
        catch (error) {
            Logger.error(`Error processing trade for follower ${followerId}: ${error}`);
        }
        Logger.separator();
    }
    // After attempting all followers, check if we should mark the trade as completely processed
    const latestTrade = yield Activity.findById(trade._id).lean();
    if (latestTrade) {
        const stillMissing = followers.filter(f => !latestTrade.processedBy.includes(f.chatId || f._id.toString()));
        if (stillMissing.length === 0) {
            yield Activity.updateOne({ _id: trade._id }, { $set: { bot: true } });
            Logger.info(`✅ Trade ${(_d = trade.transactionHash) === null || _d === void 0 ? void 0 : _d.slice(0, 8)} fully processed for all ${followers.length} followers.`);
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
const tradeExecutor = () => __awaiter(void 0, void 0, void 0, function* () {
    Logger.success('Multi-User Trade executor ready');
    if (PREVIEW_MODE) {
        Logger.warning('🔍 PREVIEW MODE ACTIVE — trades will be logged but NOT executed');
    }
    let lastCheck = Date.now();
    while (isRunning) {
        const trades = yield readUnprocessedTrades();
        if (trades.length > 0) {
            Logger.clearLine();
            Logger.header(`⚡ ${trades.length} NEW TRADE${trades.length > 1 ? 'S' : ''} DETECTED`);
            for (const trade of trades) {
                yield doTrading(trade);
            }
            lastCheck = Date.now();
        }
        else {
            if (Date.now() - lastCheck > 1000) {
                // Get count of active unique traders being monitored across all users
                const uniqueTradersCount = (yield User.distinct('config.traderAddress', { 'config.enabled': true })).length;
                Logger.waiting(uniqueTradersCount);
                lastCheck = Date.now();
            }
        }
        if (!isRunning)
            break;
        yield new Promise((resolve) => setTimeout(resolve, 100));
    }
    Logger.info('Trade executor stopped');
});
export default tradeExecutor;
