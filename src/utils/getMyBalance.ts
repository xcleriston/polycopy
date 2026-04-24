import { ClobClient } from '@polymarket/clob-client';
import Logger from './logger.js';

/**
 * Fetches real USDC balance from Polymarket CLOB.
 * Ensures the dashboard shows accurate funds for trades.
 */
const getMyBalance = async (client: ClobClient): Promise<number> => {
    try {
        // Force update to sync state
        await client.updateBalanceAllowance({
            asset_type: "COLLATERAL" as any
        });

        // Fetch actual balance from Polymarket CLOB
        const balanceData = await client.getBalanceAllowance({
            asset_type: "COLLATERAL" as any
        });

        const balance = parseFloat(balanceData.balance || "0");
        
        Logger.info(`[BALANCE_FIX] Loaded from CLOB: $${balance.toFixed(2)}`);
        return balance;
    } catch (e: any) {
        Logger.error(`[BALANCE_FIX] FAILED: ${e.message}`);
        return 0;
    }
};

export default getMyBalance;
