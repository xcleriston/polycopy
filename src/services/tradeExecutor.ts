import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User.js';
import { ENV } from '../config/env.js';
import { Activity, getUserActivityModel, IUserActivity } from '../models/userHistory.js';
import User, { IUser } from '../models/user.js';
import fetchData from '../utils/fetchData.js';
import getMyBalance from '../utils/getMyBalance.js';
import postOrder from '../utils/postOrder.js';
import Logger from '../utils/logger.js';
import telegram from '../utils/telegram.js';
import createClobClient from '../utils/createClobClient.js';
import { broadcastTrade } from '../utils/push.js';
import { refreshUserStats } from '../utils/userStats.js';

const RETRY_LIMIT = ENV.RETRY_LIMIT;
const PREVIEW_MODE = process.env.PREVIEW_MODE === 'true';

// Cache for CLOB clients to avoid repeated instantiation
const clobClientCache: Map<string, ClobClient> = new Map();

const getClobClientForUser = async (user: IUser): Promise<ClobClient | null> => {
    if (!user.wallet) {
        Logger.warning(`No wallet configured for user \${user.username || user.chatId || user._id}`);
        return null;
    }
    const cacheKey = user.wallet.address.toLowerCase();
    if (clobClientCache.has(cacheKey)) {
        return clobClientCache.get(cacheKey)!;
    }
    const client = await createClobClient(user.wallet.privateKey, user.wallet.proxyAddress || user.wallet.address);
    clobClientCache.set(cacheKey, client);
    return client;
};

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
        'config.mode': 'COPY'
    });

    if (followers.length === 0) {
        // No active followers, mark trade as done to stop polling
        await Activity.updateOne({ _id: trade._id }, { $set: { bot: true } });
        return;
    }
    // Parallel Execution: Process all followers at once
    await Promise.all(followers.map(async (follower) => {
        const followerId = (follower.chatId || (follower._id as any).toString());

        // Skip if this follower already processed this trade
        if (trade.processedBy && trade.processedBy.includes(followerId)) {
            return;
        }

        Logger.header(`👤 FOLLOWER: ${followerId} parallel copying ${traderAddress.slice(0, 6)}...`);

        try {
            const clobClient = await getClobClientForUser(follower);
            if (!clobClient) return;
            
            const proxyWallet = follower.wallet?.address;
            if (!proxyWallet) {
                Logger.warning(`[${followerId}] No wallet configured - skipping`);
                return;
            }

            // Mark user as processing immediately (atomic-ish update)
            await Activity.updateOne(
                { _id: trade._id }, 
                { $addToSet: { processedBy: followerId } }
            );

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
            } else {
                const [my_positions, user_positions, my_balance] = await Promise.all([
                    fetchData(`https://data-api.polymarket.com/positions?user=${proxyWallet}`),
                    fetchData(`https://data-api.polymarket.com/positions?user=${traderAddress}`),
                    getMyBalance(follower.wallet?.address || '', follower.wallet?.proxyAddress)
                ]);

                const user_balance = user_positions.reduce((total: number, pos: any) => {
                    return total + (pos.currentValue || 0);
                }, 0);

                const my_position = my_positions.find(
                    (position: any) => position.conditionId === trade.conditionId
                );
                const user_position = user_positions.find(
                    (position: any) => position.conditionId === trade.conditionId
                );

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
                    follower.config,
                    my_positions
                );
                
                // Refresh user balance in DB after trade
                refreshUserStats(follower._id.toString()).catch(() => {});
            }
        } catch (error) {
            Logger.error(`Error processing trade for follower ${followerId}: ${error}`);
        }
    }));

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
