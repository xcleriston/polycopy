import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User.js';
import { ENV } from '../config/env.js';
import { Activity, getUserActivityModel, IUserActivity } from '../models/userHistory.js';
import User, { IUser } from '../models/user.js';
import fetchData from '../utils/fetchData.js';
import getMyBalance from '../utils/getMyBalance.js';
import postOrder, { recordStatus } from '../utils/postOrder.js';
import Logger from '../utils/logger.js';
import telegram from '../utils/telegram.js';
import createClobClient from '../utils/createClobClient.js';
import { broadcastTrade } from '../utils/push.js';

const RETRY_LIMIT = ENV.RETRY_LIMIT;
const PREVIEW_MODE = process.env.PREVIEW_MODE === 'true';

import { getClobClientForUser, findProxyWallet } from '../utils/createClobClient.js';
import { calculateOrderSize } from '../config/copyStrategy.js';

// Check daily loss per user (wallet)
const checkDailyLoss = async (proxyWallet: string, chatId: string): Promise<boolean> => {
    // Legacy logic simplified for multi-user
    return true; // TODO: Implement per-user tracking if needed
};

interface TradeWithFollowers extends UserActivityInterface {
    traderAddress: string;
}

const readUnprocessedTrades = async (): Promise<IUserActivity[]> => {
    // Find trades that haven't been completed by everyone
    return await Activity.find({ bot: false, type: 'TRADE' }).lean() as unknown as IUserActivity[];
};

const doTrading = async (trade: any) => {
    const traderAddress = trade.traderAddress.toLowerCase();
    
    // Find all users following this trader in COPY mode
    const followers = await User.find({ 
        'config.traderAddress': { $regex: new RegExp(`^${traderAddress}$`, 'i') },
        'config.enabled': true,
        'config.mode': { $in: ['COPY', 'MIRROR_100'] }
    });

    if (followers.length === 0) {
        // No active followers, mark trade as done to stop polling
        await Activity.updateOne({ _id: trade._id }, { $set: { bot: true } });
        return;
    }
    for (const follower of followers) {
        const followerId = (follower._id as any).toString();

        // Skip if this follower already processed this trade
        if (trade.processedBy && trade.processedBy.includes(followerId)) {
            continue;
        }

        Logger.header(`👤 FOLLOWER: ${followerId} copying ${traderAddress.slice(0, 6)}...`);

        try {
            const clobClient = await getClobClientForUser(follower);
            if (!clobClient) continue;
            
            const proxyWallet = follower.wallet?.address;
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
                const targetAddr = (await findProxyWallet(follower)) || follower.wallet?.address || '';
                const [balEoa, balProxy, clobBalance] = await Promise.all([
                    getMyBalance(follower.wallet?.address || ''),
                    targetAddr !== follower.wallet?.address ? getMyBalance(targetAddr) : Promise.resolve(0),
                    getMyBalance(clobClient)
                ]);
                const my_balance = balEoa + balProxy + clobBalance;
                
                // Get current position size 
                const my_positions: UserPositionInterface[] = await fetchData(`https://data-api.polymarket.com/positions?user=${targetAddr}`);
                const my_position = my_positions.find((p: any) => p.conditionId === trade.conditionId);
                const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;

                const orderCalc = calculateOrderSize(
                    { ...follower.config, mode: follower.config.mode || 'MIRROR_100', strategy: follower.config.strategy || 'PERCENTAGE' } as any,
                    trade.usdcSize,
                    my_balance,
                    currentPositionValue
                );

                await recordStatus(trade._id, followerId, '🔍 PREVIEW', `Simulação: Compraria $${orderCalc.finalAmount.toFixed(2)}`, {
                    myEntryAmount: orderCalc.finalAmount,
                    myEntryPrice: trade.price,
                    myExecutedAt: new Date(),
                    isPreview: true
                });
            } else {
                const targetAddr = (await findProxyWallet(follower)) || follower.wallet?.address || '';
                const my_positions: UserPositionInterface[] = await fetchData(
                    `https://data-api.polymarket.com/positions?user=${targetAddr}`
                );
                const user_positions: UserPositionInterface[] = await fetchData(
                    `https://data-api.polymarket.com/positions?user=${traderAddress}`
                );
                const my_position = my_positions.find(
                    (position: UserPositionInterface) => position.conditionId === trade.conditionId
                );
                const user_position = user_positions.find(
                    (position: UserPositionInterface) => position.conditionId === trade.conditionId
                );

                const [balEoa, balProxy, clobBalance] = await Promise.all([
                    getMyBalance(follower.wallet?.address || ''),
                    targetAddr !== follower.wallet?.address ? getMyBalance(targetAddr) : Promise.resolve(0),
                    getMyBalance(clobClient)
                ]);
                const my_balance = balEoa + balProxy + clobBalance;

                const user_balance = user_positions.reduce((total: number, pos: UserPositionInterface) => {
                    return total + (pos.currentValue || 0);
                }, 0);

                Logger.info(`[${followerId}] Consolidating Balance: $${my_balance.toFixed(2)} (EOA: ${balEoa}, Proxy: ${balProxy}, CLOB: ${clobBalance})`);
                Logger.balance(my_balance, user_balance, followerId);

                // Execute the trade with FOLLOWER'S config
                await postOrder(
                    clobClient,
                    trade.side === 'BUY' ? 'buy' : 'sell',
                    my_position,
                    user_position,
                    trade,
                    my_balance,
                    followerId,
                    follower.config, // Pass individual user config
                    my_positions, // Pass all positions for exposure calculation
                    targetAddr // Pass proxyAddress
                );
                // Final mark as processed
                await Activity.updateOne(
                    { _id: trade._id }, 
                    { $addToSet: { processedBy: followerId } }
                );
            }
        } catch (error) {
            Logger.error(`Error processing trade for follower ${followerId}: ${error}`);
            // Also mark as processed on error to avoid infinite retry loops unless it's a transient network error
            const errStr = error?.toString().toLowerCase() || '';
            if (!errStr.includes('network') && !errStr.includes('timeout') && !errStr.includes('429')) {
                await Activity.updateOne({ _id: trade._id }, { $addToSet: { processedBy: followerId } });
                await recordStatus(trade._id, followerId, 'ERRO (EXECUÇÃO)', errStr.slice(0, 100));
            }
        }
        Logger.separator();
    }

    // After attempting all followers, check if we should mark the trade as completely processed
    const latestTrade = await Activity.findById(trade._id).lean() as unknown as IUserActivity | null;
    if (latestTrade) {
        const stillMissing = followers.filter(f => !latestTrade.processedBy.includes(f.chatId || (f._id as any).toString()));
        if (stillMissing.length === 0) {
            await Activity.updateOne({ _id: trade._id }, { $set: { bot: true } });
            Logger.info(`✅ Trade ${trade.transactionHash?.slice(0, 8)} fully processed for all ${followers.length} followers.`);
            
            // Notify web followers via Push
            await broadcastTrade(traderAddress, trade);
        }
    }
};

// Track executor state
let isRunning = true;

export const stopTradeExecutor = () => {
    isRunning = false;
    Logger.info('Trade executor shutdown requested...');
};

const tradeExecutor = async () => {
    Logger.success('Multi-User Trade executor ready');
    
    if (PREVIEW_MODE) {
        Logger.warning('🔍 PREVIEW MODE ACTIVE — trades will be logged but NOT executed');
    }

    let lastCheck = Date.now();
    while (isRunning) {
        const trades = await readUnprocessedTrades();

        if (trades.length > 0) {
            Logger.clearLine();
            Logger.header(`⚡ ${trades.length} NEW TRADE${trades.length > 1 ? 'S' : ''} DETECTED`);
            for (const trade of trades) {
                await doTrading(trade);
            }
            lastCheck = Date.now();
        } else {
            if (Date.now() - lastCheck > 1000) {
                // Get count of active unique traders being monitored across all users
                const uniqueTradersCount = (await User.distinct('config.traderAddress', { 'config.enabled': true })).length;
                Logger.waiting(uniqueTradersCount);
                lastCheck = Date.now();
            }
        }

        if (!isRunning) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    Logger.info('Trade executor stopped');
};

export default tradeExecutor;
