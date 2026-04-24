import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { ENV } from '../config/env.js';
import Logger from './logger.js';

const USDC_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

/**
 * Fetches USDC balance. 
 * Supports both ClobClient (accurate for CLOB funds) 
 * and wallet address (fast RPC check for EOA/Proxy).
 */
const getMyBalance = async (clientOrAddress: ClobClient | string): Promise<number> => {
    try {
        if (typeof clientOrAddress === 'string') {
            // FAST RPC CHECK (Used by Dashboard)
            const provider = new ethers.providers.JsonRpcProvider(ENV.RPC_URL);
            const usdc = new ethers.Contract(ENV.USDC_CONTRACT_ADDRESS, USDC_ABI, provider);
            const balance = await usdc.balanceOf(clientOrAddress);
            return parseFloat(ethers.utils.formatUnits(balance, 6));
        } else {
            // ACCURATE CLOB CHECK (Used by Executor)
            const balanceData = await clientOrAddress.getBalanceAllowance({
                asset_type: "COLLATERAL" as any
            });
            return parseFloat(balanceData.balance || "0");
        }
    } catch (e: any) {
        Logger.error(`[BALANCE] Failed to fetch for ${typeof clientOrAddress === 'string' ? clientOrAddress : 'Client'}: ${e.message}`);
        return 0;
    }
};

export default getMyBalance;
