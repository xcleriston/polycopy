import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ENV } from '../config/env.js';
import Logger from './logger.js';
import fetchData from './fetchData.js';

const PRIVATE_KEY = ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;

// Cache for CLOB clients
const clobClientCache: Map<string, ClobClient> = new Map();

/**
 * Attempts to find the Gnosis Safe proxy wallet linked to an EOA
 * by checking past trading activity on Polymarket.
 */
export const findProxyWallet = async (eoaOrUser: string | any): Promise<string | null> => {
    const eoa = typeof eoaOrUser === 'string' ? eoaOrUser : eoaOrUser?.wallet?.address;
    if (!eoa) return null;

    // If it's a user object and has a manual proxy address, use it
    if (typeof eoaOrUser === 'object' && eoaOrUser?.wallet?.proxyAddress) {
        return eoaOrUser.wallet.proxyAddress;
    }

    try {
        const url = `https://data-api.polymarket.com/activity?user=${eoa.toLowerCase()}&type=TRADE`;
        const activities = await fetchData(url);
        if (Array.isArray(activities) && activities.length > 0) {
            const proxy = activities[0].proxyWallet;
            if (proxy && proxy !== eoa) {
                Logger.info(`[PROXY] Detected Gnosis Safe for ${eoa.slice(0, 6)}: ${proxy}`);
                return proxy;
            }
        }
    } catch (e) {
        Logger.error(`[PROXY] Error detecting proxy for ${eoa}: ${e}`);
    }
    return null;
};

export const getClobClientForUser = async (user: any): Promise<ClobClient | null> => {
    if (!user.wallet?.privateKey) return null;
    
    const cacheKey = user.wallet.address.toLowerCase();
    if (clobClientCache.has(cacheKey)) return clobClientCache.get(cacheKey)!;

    // Detect proxy wallet for this user
    const detectedProxy = await findProxyWallet(user);
    
    const client = await createClobClient(user.wallet.privateKey, detectedProxy || undefined);
    clobClientCache.set(cacheKey, client);
    return client;
};

const createClobClient = async (customPk?: string, proxyAddress?: string): Promise<ClobClient> => {
    const chainId = 137;
    const host = CLOB_HTTP_URL as string;
    const pk = customPk || PRIVATE_KEY;

    if (!pk) throw new Error('PRIVATE_KEY is required to create CLOB client');

    const wallet = new ethers.Wallet(pk as string);
    const signatureType = proxyAddress ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;
    
    Logger.info(`[CLOB] Initializing for ${wallet.address} with SigType: ${signatureType}`);

    Logger.info(
        `[CLOB] Creating EOA client for ${wallet.address.slice(0, 8)}${proxyAddress ? ` (Proxy: ${proxyAddress.slice(0, 8)})` : ''}...`
    );

    let clobClient = new ClobClient(
        host,
        chainId,
        wallet,
        undefined,
        signatureType,
        proxyAddress, // Set funderAddress to proxyAddress
        proxyAddress  // Set proxyAddress if found
    );

    // Suppress console output during API key creation
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = function () {};
    console.error = function () {};

    try {
        let creds = await clobClient.createApiKey();
        if (!creds.key) {
            creds = await clobClient.deriveApiKey();
        }

        clobClient = new ClobClient(
            host,
            chainId,
            wallet,
            creds,
            signatureType,
            proxyAddress, // Set funderAddress to proxyAddress
            proxyAddress
        );
    } finally {
        // Restore console functions
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }

    return clobClient;
};

export default createClobClient;
