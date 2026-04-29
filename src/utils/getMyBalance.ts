import { ethers } from 'ethers';
import { ClobClient, AssetType } from '@polymarket/clob-client-v2';
import { ENV } from '../config/env.js';
import Logger from './logger.js';

const PUSD_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

const RPC_LIST = [
    ENV.RPC_URL,
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.quiknode.pro',
    'https://1rpc.io/matic',
    'https://polygon.llamarpc.com'
].filter(Boolean);

const balanceCache = new Map<string, { balance: number, timestamp: number }>();
const BALANCE_CACHE_TTL = 2000; // 2 seconds (matching roxmarket)

/**
 * Fetches pUSD (Polymarket USDC) balance via Blockchain RPC.
 * This matches the Rox Markets approach which is the most reliable
 * as it bypasses API lag and Builder credential scoping issues.
 */
const getMyBalance = async (address: string): Promise<number> => {
    if (!address || typeof address !== 'string') return 0;
    
    try {
        const cacheKey = address.toLowerCase();
        const cached = balanceCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < BALANCE_CACHE_TTL) {
            return cached.balance;
        }

        const pusdAddr = ENV.USDC_CONTRACT_ADDRESS || '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
        let finalBalance = 0;

        for (const rpc of RPC_LIST) {
            try {
                const provider = new ethers.providers.JsonRpcProvider({
                    url: rpc,
                    skipFetchSetup: true
                }, 137);
                
                const pusd = new ethers.Contract(pusdAddr, PUSD_ABI, provider);
                const balance = await pusd.balanceOf(address);
                finalBalance = parseFloat(ethers.utils.formatUnits(balance, 6));
                
                if (finalBalance > 0) {
                    Logger.info(`[BALANCE] Successfully fetched $${finalBalance.toFixed(2)} pUSD for ${address.slice(0,6)} via ${rpc}`);
                }
                break; // Success
            } catch (rpcErr) {
                // Silently try next RPC
                continue;
            }
        }

        balanceCache.set(cacheKey, { balance: finalBalance, timestamp: Date.now() });
        return finalBalance;
    } catch (e: any) {
        Logger.error(`[BALANCE] Critical failure for ${address}: ${e.message}`);
        return 0;
    }
};

export default getMyBalance;
