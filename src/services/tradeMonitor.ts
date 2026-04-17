import { ENV } from '../config/env.js';
import { getUserActivityModel, getUserPositionModel } from '../models/userHistory.js';
import User from '../models/user.js';
import fetchData from '../utils/fetchData.js';
import Logger from '../utils/logger.js';

const TOO_OLD_TIMESTAMP = ENV.TOO_OLD_TIMESTAMP;
const FETCH_INTERVAL = ENV.FETCH_INTERVAL;

const getUniqueTraders = async (): Promise<string[]> => {
    // Prevent MongoNotConnectedError by checking state
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState !== 1) return [];

    const users = await User.find({ 
        'config.traderAddress': { $exists: true, $ne: '' }, 
        'config.enabled': true,
        'config.mode': 'COPY' // Somente usuários que querem copiar
    });
    const addresses = users.map(u => u.config.traderAddress!.toLowerCase());
    return Array.from(new Set(addresses));
};

const init = async () => {
    const USER_ADDRESSES = await getUniqueTraders();
    
    if (USER_ADDRESSES.length === 0) {
        Logger.warning('No traders to monitor yet. Connect a user to start.');
        return;
    }

    const counts: number[] = [];
    for (const address of USER_ADDRESSES) {
        const UserActivity = getUserActivityModel(address);
        const count = await UserActivity.countDocuments();
        counts.push(count);
    }
    Logger.clearLine();
    Logger.dbConnection(USER_ADDRESSES, counts);

    // Initial positions display (optional/legacy)
    Logger.info(`System monitoring ${USER_ADDRESSES.length} unique trader(s).`);
};

const fetchTradeDataForTrader = async (address: string) => {
    try {
        const UserActivity = getUserActivityModel(address);
        const UserPosition = getUserPositionModel(address);

        // Fetch trade activities from Polymarket API
        const apiUrl = `https://data-api.polymarket.com/activity?user=${address}&type=TRADE`;
        const activities = await fetchData(apiUrl);

        if (!Array.isArray(activities) || activities.length === 0) {
            return;
        }

        // Process each activity
        const cutoffTimestamp = Date.now() / 1000 - TOO_OLD_TIMESTAMP * 3600;
        for (const activity of activities) {
            if (activity.timestamp < cutoffTimestamp) continue;

            const exists = await UserActivity.findOne({
                transactionHash: activity.transactionHash,
            }).exec();
            if (exists) continue;

            await UserActivity({
                proxyWallet: activity.proxyWallet,
                timestamp: activity.timestamp * 1000,
                conditionId: activity.conditionId,
                type: activity.type,
                size: activity.size,
                usdcSize: activity.usdcSize,
                transactionHash: activity.transactionHash,
                price: activity.price,
                asset: activity.asset,
                side: activity.side,
                outcomeIndex: activity.outcomeIndex,
                title: activity.title,
                slug: activity.slug,
                icon: activity.icon,
                eventSlug: activity.eventSlug,
                outcome: activity.outcome,
                name: activity.name,
                pseudonym: activity.pseudonym,
                bio: activity.bio,
                profileImage: activity.profileImage,
                profileImageOptimized: activity.profileImageOptimized,
                traderAddress: address.toLowerCase(),
                bot: false,
                botExcutedTime: 0,
            }).save();
            Logger.info(`New trade detected for ${address.slice(0, 6)}...${address.slice(-4)}`);
        }

        // Also fetch and update positions
        const positionsUrl = `https://data-api.polymarket.com/positions?user=${address}`;
        const positions = await fetchData(positionsUrl);

        if (Array.isArray(positions) && positions.length > 0) {
            for (const position of positions) {
                await UserPosition.findOneAndUpdate(
                    { asset: position.asset, conditionId: position.conditionId },
                        {
                            proxyWallet: position.proxyWallet,
                            asset: position.asset,
                            conditionId: position.conditionId,
                            size: position.size,
                            avgPrice: position.avgPrice,
                            initialValue: position.initialValue,
                            currentValue: position.currentValue,
                            cashPnl: position.cashPnl,
                            percentPnl: position.percentPnl,
                            totalBought: position.totalBought,
                            realizedPnl: position.realizedPnl,
                            percentRealizedPnl: position.percentRealizedPnl,
                            curPrice: position.curPrice,
                            redeemable: position.redeemable,
                            mergeable: position.mergeable,
                            title: position.title,
                            slug: position.slug,
                            icon: position.icon,
                            eventSlug: position.eventSlug,
                            outcome: position.outcome,
                            outcomeIndex: position.outcomeIndex,
                            oppositeOutcome: position.oppositeOutcome,
                            oppositeAsset: position.oppositeAsset,
                            endDate: position.endDate,
                            negativeRisk: position.negativeRisk,
                        },
                        { upsert: true }
                    );
                }
            }
        } catch (error) {
        Logger.error(
            `Error fetching data for ${address.slice(0, 6)}...${address.slice(-4)}: ${error}`
        );
    }
};

// Parallel fetch for all traders
const fetchTradeData = async () => {
    const USER_ADDRESSES = await getUniqueTraders();
    await Promise.allSettled(USER_ADDRESSES.map(fetchTradeDataForTrader));
};

// Track if this is the first run
let isFirstRun = true;
// Track if monitor should continue running
let isRunning = true;

/**
 * Stop the trade monitor gracefully
 */
export const stopTradeMonitor = () => {
    isRunning = false;
    Logger.info('Trade monitor shutdown requested...');
};

const tradeMonitor = async () => {
    await init();
    
    while (isRunning) {
        const USER_ADDRESSES = await getUniqueTraders();
        if (USER_ADDRESSES.length > 0) {
            if (isFirstRun) {
                Logger.success(`Monitoring ${USER_ADDRESSES.length} unique trader(s) every ${FETCH_INTERVAL}s`);
                isFirstRun = false;
            }
            await fetchTradeData();
        }
        
        if (!isRunning) break;
        await new Promise((resolve) => setTimeout(resolve, FETCH_INTERVAL * 1000));
    }

    Logger.info('Trade monitor stopped');
};

export default tradeMonitor;
