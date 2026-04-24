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
            const address = clientOrAddress;
            // Try with primary RPC
            try {
                const provider = new ethers.providers.JsonRpcProvider(ENV.RPC_URL, 137);
                const usdc = new ethers.Contract(ENV.USDC_CONTRACT_ADDRESS, USDC_ABI, provider);
                const balance = await usdc.balanceOf(address);
                return parseFloat(ethers.utils.formatUnits(balance, 6));
            } catch (rpcError) {
                Logger.warning(`[BALANCE] Primary RPC failed for ${address}, trying fallback...`);
                // Fallback to a public RPC
                const fallbackProvider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com', 137);
                const fallbackUsdc = new ethers.Contract(ENV.USDC_CONTRACT_ADDRESS, USDC_ABI, fallbackProvider);
                const balance = await fallbackUsdc.balanceOf(address);
                return parseFloat(ethers.utils.formatUnits(balance, 6));
            }
        } else {
            // ACCURATE CLOB CHECK
            const balanceData = await clientOrAddress.getBalanceAllowance({
                asset_type: "COLLATERAL" as any
            });
            return parseFloat(balanceData.balance || "0");
        }
    } catch (e: any) {
        Logger.error(`[BALANCE] Critical failure for ${typeof clientOrAddress === 'string' ? clientOrAddress : 'Client'}: ${e.message}`);
        return 0;
    }
};

export default getMyBalance;
