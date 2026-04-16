import { ethers } from 'ethers';
import { ENV } from '../config/env.js';
import { getProvider } from './rpcProvider.js';
import Logger from './logger.js';

const USDC_CONTRACT_ADDRESS = ENV.USDC_CONTRACT_ADDRESS;
const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];
const NATIVE_USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';

// Cache to prevent RPC spamming
interface BalanceCache {
    value: number;
    timestamp: number;
}
const balanceCacheMap: Map<string, BalanceCache> = new Map();
const CACHE_DURATION_MS = 10000; // 10 seconds

const getMyBalance = async (address: string, proxy?: string): Promise<number> => {
    const targetAddress = proxy || address;
    const cacheKey = targetAddress.toLowerCase();
    
    // Check cache
    const cached = balanceCacheMap.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION_MS)) {
        return cached.value;
    }

    try {
        const rpcProvider = getProvider();
        
        // Use Promise.all to fetch both balances in parallel for speed
        const nativeContract = new ethers.Contract(NATIVE_USDC, USDC_ABI, rpcProvider);
        const bridgedContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, rpcProvider);

        const [nativeBalance, bridgedBalance] = await Promise.all([
            nativeContract.balanceOf(targetAddress).catch(() => ethers.BigNumber.from(0)),
            bridgedContract.balanceOf(targetAddress).catch(() => ethers.BigNumber.from(0))
        ]);
        
        const totalRaw = nativeBalance.add(bridgedBalance);
        const balance_usdc_real = ethers.utils.formatUnits(totalRaw, 6);
        const finalValue = parseFloat(balance_usdc_real);

        // Update cache
        balanceCacheMap.set(cacheKey, { value: finalValue, timestamp: Date.now() });
        
        Logger.info(`[BALANCE] Successfully fetched for ${targetAddress}: $${finalValue.toFixed(2)}`);
        return finalValue;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Logger.error(`[BALANCE] Error fetching for ${targetAddress}: ${errorMsg}`);
        
        // If we have a cached value, return it even if expired rather than returning 0
        if (cached) {
            Logger.warning(`[BALANCE] Returning stale cache for ${targetAddress} ($${cached.value.toFixed(2)})`);
            return cached.value;
        }
        
        return 0;
    }
};

export default getMyBalance;
