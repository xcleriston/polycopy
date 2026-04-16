import { ethers } from 'ethers';
import { ENV } from '../config/env.js';
import Logger from './logger.js';
let providerInstance = null;
/**
 * Get a singleton instance of the Ethers StaticJsonRpcProvider.
 * Using StaticJsonRpcProvider avoids frequent eth_chainId calls,
 * which is critical for staying within public RPC rate limits.
 */
export const getProvider = () => {
    if (!providerInstance) {
        const rpcUrl = ENV.RPC_URL || 'https://rpc.ankr.com/polygon';
        Logger.info(`[RPC] Initializing StaticJsonRpcProvider for Polygon (ChainID: 137)`);
        // Use standard network definition for StaticJsonRpcProvider
        const network = {
            name: 'polygon',
            chainId: 137
        };
        providerInstance = new ethers.providers.StaticJsonRpcProvider(rpcUrl, network);
        // Add error handling to refresh instance if needed
        providerInstance.on('error', (error) => {
            Logger.error(`[RPC] Provider Error: ${error.message}`);
            // We don't nullify here to prevent infinite reconstruction unless necessary
        });
    }
    return providerInstance;
};
/**
 * Reset the provider instance (useful for testing or manual recovery)
 */
export const resetProvider = () => {
    providerInstance = null;
    Logger.warning(`[RPC] Provider instance has been reset`);
};
