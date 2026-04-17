import { ENV } from '../config/env.js';
import Logger from './logger.js';
const PUBLIC_RPCS = [
    ENV.RPC_URL || 'https://polygon-rpc.com',
    'https://polygon.publicnode.com',
    'https://1rpc.io/matic',
    'https://poly-rpc.gateway.pokt.network',
    'https://rpc.ankr.com/polygon'
];
let currentIndex = 0;
let providerInstance = null;
let lastRotationTime = 0;
/**
 * Get a singleton instance of the Ethers StaticJsonRpcProvider with rotation support.
 */
export const getProvider = () => {
    // High-Speed Logic: If we are on fallback node but 5 minutes have passed, try Premium again
    if (currentIndex !== 0 && Date.now() - lastRotationTime > 300000) {
        Logger.info('[RPC] Automatic recovery: Trying Premium Alchemy RPC again...');
        currentIndex = 0;
        providerInstance = null;
    }
    if (!providerInstance) {
        const rpcUrl = PUBLIC_RPCS[currentIndex];
        const isPremium = currentIndex === 0 && rpcUrl.includes('alchemy');
        Logger.info(`[RPC] Initializing \${isPremium ? "\uD83D\uDC8E PREMIUM" : "Node"} (Slot \${currentIndex}): \${rpcUrl.split('/v2/')[0]}\`);
        
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
    lastRotationTime = Date.now();
    providerInstance = null;
    Logger.warning(\`[RPC] Rotated to provider slot \${currentIndex}: \${PUBLIC_RPCS[currentIndex].split('/v2/')[0]}\`);
    return getProvider();
};

/**
 * Reset the provider instance
 */
export const resetProvider = () => {
    providerInstance = null;
    Logger.warning(`[RPC], Provider, instance, has, been, reset `);
};
        );
    }
};
