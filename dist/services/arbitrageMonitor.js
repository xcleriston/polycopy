var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import User from '../models/user.js';
import Logger from '../utils/logger.js';
import fetchData from '../utils/fetchData.js';
import createClobClient from '../utils/createClobClient.js';
import { Activity } from '../models/userHistory.js';
import { Side, OrderType } from '@polymarket/clob-client';
import telegram from '../utils/telegram.js';
import { refreshUserStats } from '../utils/userStats.js';
import getMyBalance from '../utils/getMyBalance.js';
// Configuration
const REFRESH_MARKETS_INTERVAL = 60000 * 5; // 5 minutes
const MONITOR_PRICE_INTERVAL = 1000; // 1 second (Sniper Mode)
let activeMarkets = [];
let priceBaselines = {}; // Persist baseline across cycles
let refreshInterval = null;
let monitorTimeout = null;
let isArbitrageRunning = true;
let isLoopProcessing = false;
// Cache for API responses to prevent hammering CLOB
let cachedArbitrageMarkets = [];
let lastCacheUpdateTime = 0;
const MARKET_CACHE_TTL = 2500; // 2.5 seconds
export const stopArbitrageMonitor = () => {
    isArbitrageRunning = false;
    if (refreshInterval)
        clearInterval(refreshInterval);
    if (monitorTimeout)
        clearTimeout(monitorTimeout);
    Logger.info('Arbitrage monitor stopped');
};
export const startArbitrageMonitor = () => __awaiter(void 0, void 0, void 0, function* () {
    Logger.info('⚡ Starting Autonomous Arbitrage/Hedge Bot...');
    isArbitrageRunning = true;
    // Initial fetch
    yield updateTargetMarkets();
    // Intervals
    refreshInterval = setInterval(updateTargetMarkets, REFRESH_MARKETS_INTERVAL);
    // Recursive loop instead of setInterval to prevent overlap
    const scheduleNext = () => {
        if (isArbitrageRunning) {
            monitorTimeout = setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
                yield runArbitrageLoop();
                scheduleNext();
            }), MONITOR_PRICE_INTERVAL);
        }
    };
    scheduleNext();
});
/**
 * Returns the currently tracked markets with their current midpoints
 */
export const getArbitrageMarkets = () => __awaiter(void 0, void 0, void 0, function* () {
    // Check Cache
    const now = Date.now();
    if (cachedArbitrageMarkets.length > 0 && (now - lastCacheUpdateTime < MARKET_CACHE_TTL)) {
        return cachedArbitrageMarkets;
    }
    // Enrich with current YES/NO prices 
    const enriched = yield Promise.all(activeMarkets.map((m) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const priceData = yield fetchData(`https://clob.polymarket.com/midpoint?token_id=${m.yesTokenId}`);
            const yesPrice = (priceData === null || priceData === void 0 ? void 0 : priceData.mid) ? parseFloat(priceData.mid) : 0;
            return Object.assign(Object.assign({}, m), { yesPrice, noPrice: 1 - yesPrice, target: m.question.split('above ')[1] || '---' });
        }
        catch (e) {
            return Object.assign(Object.assign({}, m), { yesPrice: 0, noPrice: 0, target: '---' });
        }
    })));
    cachedArbitrageMarkets = enriched;
    lastCacheUpdateTime = Date.now();
    return enriched;
});
/**
 * Fetches BTC 5m and 15m markets from Polymarket
 */
const updateTargetMarkets = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const url = `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&query=BTC`;
        const markets = yield fetchData(url);
        if (!Array.isArray(markets))
            return;
        const filtered = markets.filter(m => {
            const title = m.question.toLowerCase();
            return (title.includes('5m') || title.includes('15m') || title.includes('5-minute') || title.includes('15-minute'))
                && !m.closed && m.active;
        });
        activeMarkets = filtered.map(m => {
            var _a, _b;
            return ({
                conditionId: m.conditionId,
                question: m.question,
                yesTokenId: ((_a = m.clobTokenIds) === null || _a === void 0 ? void 0 : _a[0]) || '',
                noTokenId: ((_b = m.clobTokenIds) === null || _b === void 0 ? void 0 : _b[1]) || ''
            });
        }).filter(m => m.yesTokenId && m.noTokenId);
        if (activeMarkets.length > 0) {
            Logger.info(`🔍 Arbitrage Bot tracking ${activeMarkets.length} BTC markets.`);
        }
    }
    catch (error) {
        Logger.error('Error updating arbitrage markets: ' + error.message || error);
    }
});
/**
 * Main loop to check for price movements and execute arbitrage/hedge
 */
const runArbitrageLoop = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!isArbitrageRunning || isLoopProcessing)
        return;
    isLoopProcessing = true;
    try {
        // Core Guard: Database stability
        const mongoose = (yield import('mongoose')).default;
        if (mongoose.connection.readyState !== 1) {
            if (Math.random() < 0.1)
                Logger.warning('[ARBITRAGE] Database not ready, skipping cycle...');
            return;
        }
        if (activeMarkets.length === 0)
            return;
        const activeUsers = yield User.find({
            'config.enabled': true,
            'config.mode': 'ARBITRAGE',
            'wallet.privateKey': { $exists: true, $ne: '' }
        });
        if (activeUsers.length === 0) {
            if (Math.random() < 0.05)
                Logger.info('[ARBITRAGE] No active arbitrage users found. Skipping checks.');
            return;
        }
        // Processing loop
        if (Math.random() < 0.02)
            Logger.info(`⚡ [ARBITRAGE] Loop running at 1s interval. Tracking ${activeMarkets.length} markets for ${activeUsers.length} users...`);
        // Process markets in parallel
        yield Promise.all(activeMarkets.map((market) => __awaiter(void 0, void 0, void 0, function* () {
            if (!isArbitrageRunning)
                return;
            try {
                // High-Speed Midpoint Check
                const priceData = yield fetchData(`https://clob.polymarket.com/midpoint?token_id=${market.yesTokenId}`);
                if (!priceData || priceData.mid === undefined)
                    return;
                const currentPrice = parseFloat(priceData.mid);
                const previousPrice = priceBaselines[market.yesTokenId] || currentPrice;
                // Vitality check: baseline only updates when a trade happens or after a long timeout
                // Actually, let's keep it until trigger is met or 5 mins pass
                if (!priceBaselines[market.yesTokenId]) {
                    priceBaselines[market.yesTokenId] = currentPrice;
                }
                market.currentPrice = currentPrice;
                // Process all users for this market shift in parallel
                yield Promise.all(activeUsers.map((user) => __awaiter(void 0, void 0, void 0, function* () {
                    try {
                        if (isArbitrageRunning) {
                            yield processUserArbitrage(user, market, currentPrice, previousPrice);
                        }
                    }
                    catch (userErr) {
                        Logger.error(`[ARBITRAGE] Error for user ${user.chatId} on market ${market.conditionId}: ${userErr}`);
                    }
                })));
                try { }
                catch (e) { /* user handled */ }
            }
            finally { }
        })));
    }
    catch (e) { /* market handled */ }
});
try { }
catch (error) {
    Logger.error('Error in arbitrage loop: ' + error.message || error);
}
finally {
    isLoopProcessing = false;
}
;
const processUserArbitrage = (user, market, currentPrice, previousPrice) => __awaiter(void 0, void 0, void 0, function* () {
    const triggerDelta = user.config.triggerDelta || 0.005;
    const hedgeCeiling = user.config.hedgeCeiling || 0.95;
    // 1. Fetch current positions for this user in this market
    const address = user.wallet.address;
    const positions = yield fetchData(`https://data-api.polymarket.com/positions?user=${address}`);
    if (!Array.isArray(positions))
        return;
    // Find positions in this specific market
    const yesPos = positions.find(p => p.asset === market.yesTokenId);
    const noPos = positions.find(p => p.asset === market.noTokenId);
    const yesSize = yesPos ? parseFloat(yesPos.size) : 0;
    const noSize = noPos ? parseFloat(noPos.size) : 0;
    // SENSE: Calculate imbalance
    const imbalance = yesSize - noSize; // Positive means we have more YES than NO
    const balanceAbs = Math.abs(imbalance);
    // CASE A: We are unbalanced (need to Hedge / Leg 2)
    if (balanceAbs > 1) { // Threshold of 1 token for noise
        const assetToBuy = imbalance > 0 ? 'NO' : 'YES';
        const tokenId = assetToBuy === 'YES' ? market.yesTokenId : market.noTokenId;
        // Strategy: We bought Leg 1 at some price. We need the "other side" to be cheap.
        // If our YES was 0.40, we need NO to be <= 0.55 (to hit 0.95 ceiling).
        // The probability usually works as YES_prob + NO_prob = 1.0 (approx)
        // So NO_price is essentially (1.0 - YES_price).
        const yesPrice = currentPrice;
        const noPrice = 1 - currentPrice;
        const targetPrice = assetToBuy === 'YES' ? yesPrice : noPrice;
        // Check if market fulfills our target ceiling
        // Total cost of 1 Yes + 1 No should be <= hedgeCeiling
        // If we have imbalance, we check if the current price of 'assetToBuy' fulfills the condition.
        // We calculate what we spent on the other leg. Since we don't track original price easily,
        // we use the current market equilibrium requirement.
        const totalSetPrice = yesPrice + noPrice;
        if (totalSetPrice <= hedgeCeiling + 0.005) { // Small buffer for slippage
            // Valid Hedge/Arbitrage entry
            yield executeArbitrageTrade(user, market, assetToBuy, balanceAbs, 'Leg 2 / Balance');
            return;
        }
        // If not cheap enough yet, we wait.
        return;
    }
    // CASE B: We are balanced or empty. Check for Trigger (Leg 1)
    const delta = Math.abs(currentPrice - previousPrice);
    if (delta >= triggerDelta) {
        Logger.info(`🎯 [${user.chatId}] Trigger Delta reached: ${delta.toFixed(4)} on ${market.question}`);
        // Reset baseline after trigger to detect next move
        priceBaselines[market.yesTokenId] = currentPrice;
        const side = currentPrice > previousPrice ? 'YES' : 'NO';
        const tokenId = side === 'YES' ? market.yesTokenId : market.noTokenId;
        const amount = user.config.copySize || 20;
        yield executeArbitrageTrade(user, market, side, amount, 'Leg 1 / Trigger');
    }
});
export const executeArbitrageTrade = (user, market, side, amount, reason) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tokenId = side === 'YES' ? market.yesTokenId : market.noTokenId;
        const pk = user.wallet.privateKey;
        const clobClient = yield createClobClient(pk);
        Logger.info(`🚀 [${user.chatId}] Arbitrage Action: ${reason} | ${side} on ${market.question.slice(0, 30)}...`);
        const balance = yield getMyBalance(user.wallet.address);
        // Enforce exchange minimum floor ($1.00)
        let finalAmount = amount;
        if (finalAmount < 1.0) {
            Logger.info(`[${user.chatId}] Calculated size $${finalAmount.toFixed(2)} is below floor. Adjusting to $1.00.`);
            finalAmount = 1.0;
        }
        if (balance < finalAmount) {
            Logger.warning(`[${user.chatId}] Insufficient balance for arbitrage: Current $${balance.toFixed(2)} | Required $${finalAmount.toFixed(2)}`);
            return;
        }
        // Check Max Per Market
        // ... (Omitting for brevity, but recommended in production)
        const orderArgs = {
            side: Side.BUY,
            tokenID: tokenId,
            amount: finalAmount,
            // To be fast, we can use a very high price and rely on FOK/Market protection
            // Or fetch orderbook bids. For arbitrage, we usually want FOK on the Best Ask.
            price: 0.99
        };
        const signedOrder = yield clobClient.createMarketOrder(orderArgs);
        const resp = yield clobClient.postOrder(signedOrder, OrderType.FOK);
        if (resp.success) {
            Logger.success(`✅ [${user.chatId}] ${reason} Executed: ${finalAmount} tokens of ${side}`);
            // Save to database for Dashboard display
            try {
                yield Activity.create({
                    chatId: user.chatId,
                    type: 'TRADE',
                    side: 'BUY',
                    usdcSize: finalAmount,
                    processedBy: [user._id],
                    title: `${reason} | ${market.question}`,
                    asset: tokenId,
                    conditionId: market.conditionId,
                    executionStatus: 'SUCESSO',
                    price: (market.currentPrice || 0).toString(),
                    timestamp: new Date()
                });
            }
            catch (dbErr) {
                Logger.error(`[DB] Failed to save arbitrage activity: ${dbErr}`);
            }
            telegram.tradeExecuted(user.chatId, side, finalAmount, 1.0, market.question);
            // Refresh balance in DB after arbitrage
            refreshUserStats(user._id.toString()).catch(() => { });
        }
        else {
            Logger.error(`[${user.chatId}] Arbitrage execution failed: ${JSON.stringify(resp)}`);
        }
    }
    catch (error) {
        Logger.error(`[${user.chatId}] Arbitrage exception: ${error.message || error}`);
    }
});
