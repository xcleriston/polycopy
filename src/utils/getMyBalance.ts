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
    'https://polygon.drpc.org',
    'https://1rpc.io/matic',
    'https://polygon-mainnet.g.allthatnode.com/full/mainnet',
    'https://polygon-rpc.com',
].filter(Boolean);

const balanceCache = new Map<string, { balance: number, timestamp: number }>();
const BALANCE_CACHE_TTL = 2000; // 2 seconds (matching roxmarket)

/**
 * Fetches USDC balance via Blockchain RPC.
 * Prioritizes Proxy/Gnosis Safe balance as per user requirements.
 */
const getMyBalance = async (address: string): Promise<number> => {
    if (!address || typeof address !== 'string') return 0;
    
    const cacheKey = address.toLowerCase();
    const cached = balanceCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < BALANCE_CACHE_TTL) {
        return cached.balance;
    }

    // Official Polymarket USDC.e (PoS) address
    const pusdAddr = ENV.USDC_CONTRACT_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
    let finalBalance = 0;

    for (const rpc of RPC_LIST) {
        try {
            // Using fetch to bypass some ethers network detection issues on VPS
            const provider = new ethers.providers.StaticJsonRpcProvider({
                url: rpc,
                skipFetchSetup: true
            }, 137);
            
            const pusd = new ethers.Contract(pusdAddr, PUSD_ABI, provider);
            const balance = await pusd.balanceOf(address);
            finalBalance = parseFloat(ethers.utils.formatUnits(balance, 6));
            
            if (finalBalance >= 0) {
                Logger.info(`[BALANCE] Successfully fetched $${finalBalance.toFixed(2)} pUSD for ${address.slice(0,6)} via ${rpc}`);
                break; // Success
            }
        } catch (rpcErr) {
            continue;
        }
    }

    balanceCache.set(cacheKey, { balance: finalBalance, timestamp: Date.now() });
    return finalBalance;
};

export default getMyBalance;
