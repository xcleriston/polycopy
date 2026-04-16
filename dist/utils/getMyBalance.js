var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ethers } from 'ethers';
import { ENV } from '../config/env.js';
import { getProvider } from './rpcProvider.js';
import Logger from './logger.js';
const USDC_CONTRACT_ADDRESS = ENV.USDC_CONTRACT_ADDRESS;
const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];
const NATIVE_USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const balanceCacheMap = new Map();
const CACHE_DURATION_MS = 10000; // 10 seconds
const getMyBalance = (address, proxy) => __awaiter(void 0, void 0, void 0, function* () {
    const targetAddress = proxy || address;
    const cacheKey = targetAddress.toLowerCase();
    // Check cache
    const cached = balanceCacheMap.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION_MS)) {
        return cached.value;
    }
    try {
        const rpcProvider = getProvider();
        // Sequential calls are more stable on Ankr than Promise.all for some connection types
        const nativeContract = new ethers.Contract(NATIVE_USDC, USDC_ABI, rpcProvider);
        const nativeBalance = yield nativeContract.balanceOf(targetAddress).catch((e) => {
            Logger.error(`[BALANCE] Native fetch error: ${e.message}`);
            return ethers.BigNumber.from(0);
        });
        const bridgedContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, rpcProvider);
        const bridgedBalance = yield bridgedContract.balanceOf(targetAddress).catch((e) => {
            Logger.error(`[BALANCE] Bridged fetch error: ${e.message}`);
            return ethers.BigNumber.from(0);
        });
        const totalRaw = nativeBalance.add(bridgedBalance);
        const balance_usdc_real = ethers.utils.formatUnits(totalRaw, 6);
        const finalValue = parseFloat(balance_usdc_real);
        // Update cache
        balanceCacheMap.set(cacheKey, { value: finalValue, timestamp: Date.now() });
        Logger.info(`[BALANCE] ${targetAddress} | Native: ${ethers.utils.formatUnits(nativeBalance, 6)} | Bridged: ${ethers.utils.formatUnits(bridgedBalance, 6)} | Total: $${finalValue.toFixed(2)}`);
        return finalValue;
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Logger.error(`[BALANCE] Error fetching for ${targetAddress}: ${errorMsg}`);
        // If we have a cached value, return it even if expired rather than returning 0
        if (cached) {
            Logger.warning(`[BALANCE] Returning stale cache for ${targetAddress} ($${cached.value.toFixed(2)})`);
            return cached.value;
        }
        return 0;
    }
});
export default getMyBalance;
