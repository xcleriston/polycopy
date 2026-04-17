import User from '../models/user.js';
import getMyBalance from './getMyBalance.js';
import fetchData from './fetchData.js';
import Logger from './logger.js';

/**
 * Force a refresh of user balance and exposure and save to DB
 */
export async function refreshUserStats(userId: string): Promise<boolean> {
    try {
        const user = await User.findById(userId);
        if (!user || !user.wallet?.address) return false;

        const mainAddress = user.wallet.address;
        const proxyAddress = user.wallet.proxyAddress || mainAddress;

        const balance = await getMyBalance(mainAddress, proxyAddress);
        
        // Fetch positions to calculate exposure
        const positionsData = await fetchData(`https://data-api.polymarket.com/positions?user=${proxyAddress}`);
        const exposure = (positionsData || []).reduce((sum: number, pos: any) => sum + (pos.currentValue || 0), 0);

        await User.updateOne(
            { _id: userId },
            { 
                $set: { 
                    'stats.balance': balance, 
                    'stats.exposure': exposure, 
                    'stats.lastUpdate': new Date() 
                } 
            }
        );

        Logger.info(`[STATS] Refreshed balance for ${user.username || user.chatId}: $${balance.toFixed(2)}`);
        return true;
    } catch (e) {
        Logger.error(`[STATS] Failed to refresh stats for ${userId}: ${e}`);
        return false;
    }
}
