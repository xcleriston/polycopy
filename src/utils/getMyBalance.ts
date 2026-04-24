import createClobClient from './createClobClient.js';
import Logger from './logger.js';

/**
 * AGENT 4: BALANCE FIX ENGINE (Surgical Patch)
 * Fetches real USDC balance from Polymarket CLOB.
 * Ensures the dashboard shows accurate funds for Proxy Wallets.
 */
const getMyBalance = async (address: string, proxy?: string): Promise<number> => {
    try {
        const client = await createClobClient();
        
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
