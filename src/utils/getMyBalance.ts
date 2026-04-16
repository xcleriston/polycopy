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
    const cacheKey = `balance_${targetAddress.toLowerCase()}`;
    
    // Check cache
    const cached = balanceCacheMap.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION_MS)) {
        return cached.value;
    }

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            const rpcProvider = getProvider();
            
            // Sequential calls are more stable on Ankr than Promise.all for some connection types
            const nativeContract = new ethers.Contract(NATIVE_USDC, USDC_ABI, rpcProvider);
            const nativeBalance = await nativeContract.balanceOf(targetAddress);

            const bridgedContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, rpcProvider);
            const bridgedBalance = await bridgedContract.balanceOf(targetAddress);
            
            const totalRaw = nativeBalance.add(bridgedBalance);
            const balance_usdc_real = ethers.utils.formatUnits(totalRaw, 6);
            const finalValue = parseFloat(balance_usdc_real);

            // Update cache
            balanceCacheMap.set(cacheKey, { value: finalValue, timestamp: Date.now() });
            
            Logger.info(`[BALANCE] ${targetAddress} | Native: ${ethers.utils.formatUnits(nativeBalance, 6)} | Bridged: ${ethers.utils.formatUnits(bridgedBalance, 6)} | Total: $${finalValue.toFixed(2)}`);
            return finalValue;
        } catch (error) {
            attempts++;
            const errorMsg = error instanceof Error ? error.message : String(error);
            Logger.warning(`[BALANCE] Attempt ${attempts} failed for ${targetAddress}: ${errorMsg}`);
            
            if (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('rate limit') || errorMsg.includes('429') || errorMsg.includes('block')) {
                Logger.error(`[BALANCE] RPC Issue/Block detected, rotating...`);
                import('./rpcProvider.js').then(m => m.rotateProvider());
            }

            if (attempts >= maxAttempts) {
                Logger.error(`[BALANCE] All ${maxAttempts} attempts failed for ${targetAddress}`);
                if (cached) {
                    Logger.warning(`[BALANCE] Returning stale cache for ${targetAddress} ($${cached.value.toFixed(2)})`);
                    return cached.value;
                }
                return 0;
            }
            
            // Small delay before retry
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }
    
    return 0;
};

export default getMyBalance;
