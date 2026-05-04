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
import postOrder, { recordStatus } from '../utils/postOrder.js';
import Logger from '../utils/logger.js';
import { broadcastTrade } from '../utils/push.js';
const RETRY_LIMIT = ENV.RETRY_LIMIT;
const PREVIEW_MODE = process.env.PREVIEW_MODE === 'true';
import { getClobClientForUser, findProxyWallet } from '../utils/createClobClient.js';
import { calculateOrderSize } from '../config/copyStrategy.js';
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
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const traderAddress = trade.traderAddress.toLowerCase();
    // Find all users following this trader in COPY mode
    const followers = yield User.find({
        'config.traderAddress': { $regex: new RegExp(`^${traderAddress}$`, 'i') },
        'config.enabled': true,
        'config.mode': { $in: ['COPY', 'MIRROR_100'] }
    });
    if (followers.length === 0) {
        // No active followers, mark trade as done to stop polling
        yield Activity.updateOne({ _id: trade._id }, { $set: { bot: true } });
        return;
    }
    for (const follower of followers) {
        const followerId = follower._id.toString();
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
            // We will mark as processed AFTER attempt or final skip
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
                // SIMULATE CALCULATION FOR DISPLAY
                const targetAddr = (yield findProxyWallet(follower)) || ((_b = follower.wallet) === null || _b === void 0 ? void 0 : _b.address) || '';
                const [balEoa, balProxy, clobBalance] = yield Promise.all([
                    getMyBalance(((_c = follower.wallet) === null || _c === void 0 ? void 0 : _c.address) || ''),
                    targetAddr !== ((_d = follower.wallet) === null || _d === void 0 ? void 0 : _d.address) ? getMyBalance(targetAddr) : Promise.resolve(0),
                    getMyBalance(clobClient)
                ]);
                const my_balance = balEoa + balProxy + clobBalance;
                // Get current position size 
                const my_positions = yield fetchData(`https://data-api.polymarket.com/positions?user=${targetAddr}`);
                const my_position = my_positions.find((p) => p.conditionId === trade.conditionId);
                const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;
                const orderCalc = calculateOrderSize(Object.assign(Object.assign({}, follower.config), { mode: follower.config.mode || 'MIRROR_100', strategy: follower.config.strategy || 'PERCENTAGE' }), trade.usdcSize, my_balance, currentPositionValue);
                yield recordStatus(trade._id, followerId, '🔍 PREVIEW', `Simulação: Compraria $${orderCalc.finalAmount.toFixed(2)}`, {
                    myEntryAmount: orderCalc.finalAmount,
                    myEntryPrice: trade.price,
                    myExecutedAt: new Date(),
                    isPreview: true
                });
            }
            else {
                const targetAddr = (yield findProxyWallet(follower)) || ((_e = follower.wallet) === null || _e === void 0 ? void 0 : _e.address) || '';
                const my_positions = yield fetchData(`https://data-api.polymarket.com/positions?user=${targetAddr}`);
                const user_positions = yield fetchData(`https://data-api.polymarket.com/positions?user=${traderAddress}`);
                const my_position = my_positions.find((position) => position.conditionId === trade.conditionId);
                const user_position = user_positions.find((position) => position.conditionId === trade.conditionId);
                const [balEoa, balProxy, clobBalance] = yield Promise.all([
                    getMyBalance(((_f = follower.wallet) === null || _f === void 0 ? void 0 : _f.address) || ''),
                    targetAddr !== ((_g = follower.wallet) === null || _g === void 0 ? void 0 : _g.address) ? getMyBalance(targetAddr) : Promise.resolve(0),
                    getMyBalance(clobClient)
                ]);
                const my_balance = balEoa + balProxy + clobBalance;
                const user_balance = user_positions.reduce((total, pos) => {
                    return total + (pos.currentValue || 0);
                }, 0);
                Logger.info(`[${followerId}] Consolidating Balance: $${my_balance.toFixed(2)} (EOA: ${balEoa}, Proxy: ${balProxy}, CLOB: ${clobBalance})`);
                Logger.balance(my_balance, user_balance, followerId);
                // Execute the trade with FOLLOWER'S config
                yield postOrder(clobClient, trade.side === 'BUY' ? 'buy' : 'sell', my_position, user_position, trade, my_balance, followerId, follower.config, // Pass individual user config
                // Final mark as processed with status in ONE ATOMIC CALL
                yield recordStatus(trade._id, followerId, 'SUCESSO', 'Executado com sucesso', {
                    processed: true // This will signal the executor to add to processedBy
                }));
            }
        }
        catch (error) {
            Logger.error(`Error processing trade for follower ${followerId}: ${error}`);
            const errStr = (error === null || error === void 0 ? void 0 : error.toString().toLowerCase()) || '';
            if (!errStr.includes('network') && !errStr.includes('timeout') && !errStr.includes('429')) {
                yield recordStatus(trade._id, followerId, 'ERRO (EXECUÇÃO)', errStr.slice(0, 100), {
                    processed: true
                });
            }
        }
        Logger.separator();
    }
    // After attempting all followers, check if we should mark the trade as completely processed
    const latestTrade = yield Activity.findById(trade._id).lean();
    if (latestTrade) {
        const stillMissing = followers.filter(f => !latestTrade.processedBy.includes(f.chatId || f._id.toString()));
        if (stillMissing.length === 0) {
            yield Activity.updateOne({ _id: trade._id }, { $set: { bot: true } });
            Logger.info(`✅ Trade ${(_h = trade.transactionHash) === null || _h === void 0 ? void 0 : _h.slice(0, 8)} fully processed for all ${followers.length} followers.`);
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
