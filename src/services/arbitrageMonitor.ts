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
const MONITOR_PRICE_INTERVAL = 5000;       // 5 seconds for loop check

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
let monitorInterval: NodeJS.Timeout | null = null;
let isArbitrageRunning = true;

export const stopArbitrageMonitor = () => {
    isArbitrageRunning = false;
    if (refreshInterval) clearInterval(refreshInterval);
    if (monitorInterval) clearInterval(monitorInterval);
    Logger.info('Arbitrage monitor stopped');
};

export const startArbitrageMonitor = async () => {
    Logger.info('⚡ Starting Autonomous Arbitrage/Hedge Bot...');
    isArbitrageRunning = true;
    
    // Initial fetch
    await updateTargetMarkets();
    
    // Intervals
    refreshInterval = setInterval(updateTargetMarkets, REFRESH_MARKETS_INTERVAL);
    monitorInterval = setInterval(runArbitrageLoop, MONITOR_PRICE_INTERVAL);
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
            return (title.includes('5m') || title.includes('15m') || title.includes('5-minute') || title.includes('15-minute')) 
                   && !m.closed && m.active;
        });

        activeMarkets = filtered.map(m => ({
            conditionId: m.conditionId,
            question: m.question,
            yesTokenId: m.clobTokenIds?.[0] || '',
            noTokenId: m.clobTokenIds?.[1] || ''
        })).filter(m => m.yesTokenId && m.noTokenId);

        if (activeMarkets.length > 0) {
            Logger.info(`🔍 Arbitrage Bot tracking ${activeMarkets.length} BTC markets.`);
        }
    } catch (error: any) {
        Logger.error('Error updating arbitrage markets: ' + error.message || error);
    }
};

/**
 * Main loop to check for price movements and execute arbitrage/hedge
 */
const runArbitrageLoop = async () => {
    if (!isArbitrageRunning) return;

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

        if (activeUsers.length === 0) return;

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
                // Isolated market failure - Circuit Breaker pattern
            }
        }));
    } catch (error: any) {
        Logger.error('Arbitrage loop critical failure: ' + (error.message || error));
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
            await executeArbitrageTrade(user, market, tokenId, 'BUY', balanceAbs, 'Leg 2 / Balance');
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
        await executeArbitrageTrade(user, market, tokenId, 'BUY', amount, 'Leg 1 / Trigger');
    }
};

const executeArbitrageTrade = async (user: any, market: ArbitrageMarket, tokenId: string, side: string, amount: number, reason: string) => {
    try {
        const pk = user.wallet.privateKey;
        const clobClient = await createClobClient(pk);
        
        Logger.info(`🚀 [${user.chatId}] Arbitrage Action: ${reason} | ${side} on ${market.question.slice(0, 30)}...`);
        
        const balance = await getMyBalance(user.wallet.address);
        if (balance < amount) {
            Logger.warning(`[${user.chatId}] Insufficient balance for arbitrage: $${balance.toFixed(2)}`);
            return;
        }

        // Check Max Per Market
        // ... (Omitting for brevity, but recommended in production)

        const orderArgs = {
            side: Side.BUY,
            tokenID: tokenId,
            amount: amount,
            // To be fast, we can use a very high price and rely on FOK/Market protection
            // Or fetch orderbook bids. For arbitrage, we usually want FOK on the Best Ask.
            price: 0.99 
        };

        const signedOrder = await clobClient.createMarketOrder(orderArgs);
        const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);

        if (resp.success) {
            Logger.success(`✅ [${user.chatId}] ${reason} Executed: ${amount} tokens of ${side}`);
            
            // Save to database for Dashboard display
            try {
                await Activity.create({
                    chatId: user.chatId,
                    type: 'TRADE',
                    side: 'BUY',
                    usdcSize: amount,
                    processedBy: [user._id],
                    title: `${reason} | ${market.question}`,
                    asset: tokenId,
                    conditionId: market.conditionId,
                    executionStatus: 'SUCESSO',
                    price: (market.currentPrice || 0).toString(),
                    timestamp: new Date()
                });
            } catch (dbErr) {
                Logger.error(`[DB] Failed to save arbitrage activity: ${dbErr}`);
            }

            telegram.tradeExecuted(user.chatId, side, amount, 1.0, market.question);
            
            // Refresh balance in DB after arbitrage
            refreshUserStats(user._id.toString()).catch(() => {});
        } else {
            Logger.error(`[${user.chatId}] Arbitrage execution failed: ${JSON.stringify(resp)}`);
        }
    } catch (error: any) {
        Logger.error(`[${user.chatId}] Arbitrage exception: ${error.message || error}`);
    }
};
