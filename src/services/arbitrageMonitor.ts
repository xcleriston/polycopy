import { ethers } from 'ethers';
import { ENV } from '../config/env.js';
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
const MONITOR_PRICE_INTERVAL = 1000;       // 1 second (Sniper Mode)

interface ArbitrageMarket {
    conditionId: string;
    question: string;
    yesTokenId: string;
    noTokenId: string;
    currentPrice?: number;
}

let activeMarkets: ArbitrageMarket[] = [];
let priceBaselines: Record<string, number> = {}; // Persist baseline across cycles

let refreshInterval: NodeJS.Timeout | null = null;
let monitorTimeout: NodeJS.Timeout | null = null;
let isArbitrageRunning = true;
let isLoopProcessing = false;

// Cache for API responses to prevent hammering CLOB
let cachedArbitrageMarkets: any[] = [];
let lastCacheUpdateTime = 0;
const MARKET_CACHE_TTL = 2500; // 2.5 seconds

export const stopArbitrageMonitor = () => {
    isArbitrageRunning = false;
    if (refreshInterval) clearInterval(refreshInterval);
    if (monitorTimeout) clearTimeout(monitorTimeout);
    Logger.info('Arbitrage monitor stopped');
};

export const startArbitrageMonitor = async () => {
    Logger.info('⚡ Starting Autonomous Arbitrage/Hedge Bot...');
    isArbitrageRunning = true;
    
    // Initial fetch
    await updateTargetMarkets();
    
    // Intervals
    refreshInterval = setInterval(updateTargetMarkets, REFRESH_MARKETS_INTERVAL);
    
    // Recursive loop instead of setInterval to prevent overlap
    const scheduleNext = () => {
        if (isArbitrageRunning) {
            monitorTimeout = setTimeout(async () => {
                await runArbitrageLoop();
                scheduleNext();
            }, MONITOR_PRICE_INTERVAL);
        }
    };
    scheduleNext();
};

/**
 * Returns the currently tracked markets with their current midpoints
 */
export const getArbitrageMarkets = async () => {
    // Check Cache
    const now = Date.now();
    if (cachedArbitrageMarkets.length > 0 && (now - lastCacheUpdateTime < MARKET_CACHE_TTL)) {
        return cachedArbitrageMarkets;
    }

    // Enrich with current YES/NO prices 
    const enriched = await Promise.all(activeMarkets.map(async (m) => {
        try {
            const priceData = await fetchData(`https://clob.polymarket.com/midpoint?token_id=${m.yesTokenId}`);
            // Use midpoint if available, otherwise fallback to the initial prices from Gamma API
            let yesPrice = priceData?.mid ? parseFloat(priceData.mid) : (m as any).initialYesPrice || 0;
            
            // Safety: if the midpoint is exactly 0 but initial exists, use initial
            if (yesPrice === 0 && (m as any).initialYesPrice > 0) yesPrice = (m as any).initialYesPrice;

            // Robust target capture (V13): matches numbers, optionally prefixed with $, after various keywords
            let targetMatch = m.question.match(/(?:above|reach|hit|higher than|at least|price of)\s+[$]?([\d,.]+)/i);
            let target = targetMatch ? targetMatch[1] : '---';

            // Magnitude Fallback (V13): If no keyword match, find any number > 10,000 (BTC context)
            if (target === '---') {
                const numbers = m.question.replace(/,/g, '').match(/\d+/g);
                if (numbers) {
                    const potential = numbers.map(Number).filter(n => n > 10000).sort((a,b) => b-a)[0];
                    if (potential) {
                        target = potential.toLocaleString();
                        Logger.info(`[V13] Target Fallback used for: ${m.question} -> ${target}`);
                    }
                }
            }

            return { ...m, yesPrice, noPrice: 1 - yesPrice, target };
        } catch (e) {
            return { ...m, yesPrice: (m as any).initialYesPrice || 0, noPrice: (m as any).initialNoPrice || 0, target: '---' };
        }
    }));

    cachedArbitrageMarkets = enriched;
    lastCacheUpdateTime = Date.now();
    return enriched;
};

/**
 * Fetches BTC 5m and 15m markets from Polymarket
 */
const updateTargetMarkets = async () => {
    try {
        const url = `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&query=BTC`;
        const markets = await fetchData(url);
        
        if (!Array.isArray(markets)) return;

        const filtered = markets.filter(m => {
            const title = m.question.toLowerCase();
            const isBitcoin = title.includes('bitcoin') || title.includes('btc');
            const isPrediction = title.includes('above') || title.includes('below') || title.includes('at least') || title.includes('reach') || title.includes('hit');
            return isBitcoin && isPrediction && !m.closed && m.active;
        });

        activeMarkets = filtered.map(m => {
            const prices = JSON.parse(m.outcomePrices || '["0.5", "0.5"]');
            return {
                conditionId: m.conditionId,
                question: m.question,
                yesTokenId: m.clobTokenIds?.[0] || '',
                noTokenId: m.clobTokenIds?.[1] || '',
                initialYesPrice: parseFloat(prices[0] || '0.5'),
                initialNoPrice: parseFloat(prices[1] || '0.5')
            };
        }).filter(m => m.yesTokenId && m.noTokenId);

        if (activeMarkets.length > 0) {
            Logger.info(`🔍 [DEBUG] Arbitrage Bot encontrou ${activeMarkets.length} mercados de BTC.`);
            Logger.info(`🎯 [DEBUG] Mercados detectados: ${activeMarkets.map(m => m.question.slice(0, 40)).join(' | ')}`);
        } else {
            Logger.warning(`⚠️ [DEBUG] Nenhum mercado de BTC encontrado com os filtros atuais.`);
        }
    } catch (error: any) {
        Logger.error('Error updating arbitrage markets: ' + error.message || error);
    }
};

/**
 * Main loop to check for price movements and execute arbitrage/hedge
 */
const runArbitrageLoop = async () => {
    if (!isArbitrageRunning || isLoopProcessing) return;
    
    isLoopProcessing = true;
    try {
        // Core Guard: Database stability
        const mongoose = (await import('mongoose')).default;
        if (mongoose.connection.readyState !== 1) {
            if (Math.random() < 0.1) Logger.warning('[ARBITRAGE] Database not ready, skipping cycle...');
            return;
        }

        if (activeMarkets.length === 0) return;

        const activeUsers = await User.find({ 
            'config.enabled': true, 
            'config.mode': 'ARBITRAGE',
            'wallet.privateKey': { $exists: true, $ne: '' }
        });

        if (activeUsers.length === 0) {
            if (Math.random() < 0.05) Logger.info('[ARBITRAGE] No active arbitrage users found. Skipping checks.');
            return;
        }

        // Processing loop
        if (Math.random() <0.02) Logger.info(`⚡ [ARBITRAGE] Loop running at 1s interval. Tracking ${activeMarkets.length} markets for ${activeUsers.length} users...`);

        // Process markets in parallel
        await Promise.all(activeMarkets.map(async (market) => {
            if (!isArbitrageRunning) return;

            try {
                // High-Speed Midpoint Check
                const priceData = await fetchData(`https://clob.polymarket.com/midpoint?token_id=${market.yesTokenId}`);
                if (!priceData || priceData.mid === undefined) return;

                const currentPrice = parseFloat(priceData.mid); 
                const previousPrice = priceBaselines[market.yesTokenId] || currentPrice;
                
                // Vitality check: baseline only updates when a trade happens or after a long timeout
                // Actually, let's keep it until trigger is met or 5 mins pass
                if (!priceBaselines[market.yesTokenId]) {
                    priceBaselines[market.yesTokenId] = currentPrice;
                }
                
                market.currentPrice = currentPrice;

                // Process all users for this market shift in parallel
                await Promise.all(activeUsers.map(async (user) => {
                    try {
                        if (isArbitrageRunning) {
                            await processUserArbitrage(user, market, currentPrice, previousPrice);
                        }
                    } catch (userErr) {
                        Logger.error(`[ARBITRAGE] Error for user ${user.chatId} on market ${market.conditionId}: ${userErr}`);
                    }
                }));
            } catch (marketErr) {
                Logger.error(`[ARBITRAGE] Error monitoring market ${market.conditionId}: ${marketErr}`);
            }
        }));
    } catch (error: any) {
        Logger.error('Error in arbitrage loop: ' + (error.message || error));
    } finally {
        isLoopProcessing = false;
    }
};

const processUserArbitrage = async (user: any, market: ArbitrageMarket, currentPrice: number, previousPrice: number) => {
    const triggerDelta = user.config.triggerDelta || 0.005;
    const hedgeCeiling = user.config.hedgeCeiling || 0.95;
    
    // 1. Fetch current positions for this user in this market
    const address = user.wallet.address;
    const positions = await fetchData(`https://data-api.polymarket.com/positions?user=${address}`);
    
    if (!Array.isArray(positions)) return;

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
            await executeArbitrageTrade(user, market, assetToBuy, balanceAbs, 'Leg 2 / Balance');
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
        await executeArbitrageTrade(user, market, side, amount, 'Leg 1 / Trigger');
    }
};

export const executeArbitrageTrade = async (user: any, market: ArbitrageMarket, side: string, amount: number, reason: string, action: 'BUY' | 'SELL' = 'BUY') => {
    try {
        const tokenId = side === 'YES' ? market.yesTokenId : market.noTokenId;
        const pk = user.wallet.privateKey;
        const clobClient = await createClobClient(pk);
        
        const actionStr = action === 'BUY' ? 'COMPRANDO' : 'VENDENDO';
        Logger.info(`🚀 [${user.chatId}] Arbitrage Action: ${reason} | ${actionStr} ${side} on ${market.question.slice(0, 30)}...`);
        
        if (action === 'BUY') {
            const balance = await getMyBalance(user.wallet.address);
            
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

            const orderArgs = {
                side: Side.BUY,
                tokenID: tokenId,
                amount: finalAmount,
                price: 0.99 
            };

            const signedOrder = await clobClient.createMarketOrder(orderArgs);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
            
            if (resp.success) {
                Logger.success(`✅ [${user.chatId}] ${reason} Executed: BUY ${finalAmount} tokens of ${side}`);
                await recordArbitrageActivity(user, market, side, tokenId, finalAmount, 'BUY', reason);
                telegram.tradeExecuted(user.chatId, side, finalAmount, 1.0, market.question);
                refreshUserStats(user._id.toString()).catch(() => {});
            } else {
                Logger.error(`[${user.chatId}] Arbitrage BUY failed: ${JSON.stringify(resp)}`);
            }
        } else {
            // SELL logic
            // To sell, we specify the amount of tokens
            const orderArgs = {
                side: Side.SELL,
                tokenID: tokenId,
                amount: amount, // For sell, 'amount' is tokens
                price: 0.01 
            };

            const signedOrder = await clobClient.createMarketOrder(orderArgs);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);

            if (resp.success) {
                Logger.success(`✅ [${user.chatId}] ${reason} Executed: SELL ${amount} tokens of ${side}`);
                await recordArbitrageActivity(user, market, side, tokenId, amount * (market.currentPrice || 0.5), 'SELL', reason);
                telegram.tradeExecuted(user.chatId, side, amount, 0, market.question); // Simple alert
                refreshUserStats(user._id.toString()).catch(() => {});
            } else {
                Logger.error(`[${user.chatId}] Arbitrage SELL failed: ${JSON.stringify(resp)}`);
            }
        }
    } catch (error: any) {
        Logger.error(`[${user.chatId}] Arbitrage exception: ${error.message || error}`);
    }
};

const recordArbitrageActivity = async (user: any, market: ArbitrageMarket, side: string, asset: string, usdcSize: number, action: string, reason: string) => {
    try {
        await Activity.create({
            chatId: user.chatId,
            type: 'TRADE',
            side: action,
            usdcSize: usdcSize,
            processedBy: [user._id],
            title: `${reason} | ${market.question}`,
            asset: asset,
            conditionId: market.conditionId,
            executionStatus: 'SUCESSO',
            price: (market.currentPrice || 0).toString(),
            timestamp: new Date()
        });
    } catch (dbErr) {
        Logger.error(`[DB] Failed to save arbitrage activity: ${dbErr}`);
    }
};
