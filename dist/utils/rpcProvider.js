import { ethers } from 'ethers';
import { ENV } from '../config/env.js';
import Logger from './logger.js';
const PUBLIC_RPCS = [
    ENV.RPC_URL || 'https://polygon-rpc.com',
    'https://polygon.publicnode.com',
    'https://1rpc.io/matic',
    'https://poly-rpc.gateway.pokt.network',
    'https://rpc.ankr.com/polygon' // Keep as fallback
];
let currentIndex = 0;
let providerInstance = null;
/**
 * Get a singleton instance of the Ethers StaticJsonRpcProvider with rotation support.
 */
export const getProvider = () => {
    if (!providerInstance) {
        const rpcUrl = PUBLIC_RPCS[currentIndex];
        Logger.info(`[RPC] Initializing Provider (Slot ${currentIndex}): ${rpcUrl}`);
        const network = {
            name: 'polygon',
            chainId: 137
        };
        providerInstance = new ethers.providers.StaticJsonRpcProvider(rpcUrl, network);
    }
    return providerInstance;
};
/**
 * Handle provider errors by rotating to the next RPC
 */
export const rotateProvider = () => {
    currentIndex = (currentIndex + 1) % PUBLIC_RPCS.length;
    providerInstance = null;
    Logger.warning(`[RPC] Rotated to provider slot ${currentIndex}: ${PUBLIC_RPCS[currentIndex]}`);
    return getProvider();
};
/**
 * Reset the provider instance
 */
export const resetProvider = () => {
    providerInstance = null;
    Logger.warning(`[RPC] Provider instance has been reset`);
};
