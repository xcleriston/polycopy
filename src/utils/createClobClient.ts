import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ENV } from '../config/env.js';
import Logger from './logger.js';
import fetchData from './fetchData.js';
import User from '../models/user.js';

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

    const detectedProxy = await findProxyWallet(user);
    
    // Persist detected proxy to DB if not already saved
    if (detectedProxy && user.wallet && user.wallet.proxyAddress !== detectedProxy) {
        try {
            await User.findByIdAndUpdate(user._id, {
                $set: { 'wallet.proxyAddress': detectedProxy }
            });
            user.wallet.proxyAddress = detectedProxy; // Update local object too
            Logger.info(`[PROXY] Persisted detected proxy for ${user.wallet.address.slice(0, 8)}: ${detectedProxy}`);
        } catch (e) {
            Logger.error(`[PROXY] Failed to persist proxy: ${e}`);
        }
    }
    
    // Check if we already have credentials in the DB
    if (user.wallet?.clobCreds?.key && user.wallet?.clobCreds?.secret) {
        Logger.info(`[CLOB] Using persisted credentials for ${user.wallet.address.slice(0, 8)}`);
        const client = await createClobClient(user.wallet.privateKey, detectedProxy || undefined, user.wallet.clobCreds);
        clobClientCache.set(cacheKey, client);
        return client;
    }

    const { client, creds } = await createClobClientAndDerive(user.wallet.privateKey, detectedProxy || undefined);
    
    // Persist credentials to DB
    if (creds && user._id) {
        try {
            await User.findByIdAndUpdate(user._id, {
                $set: {
                    'wallet.clobCreds': {
                        ...creds,
                        derivedAt: new Date()
                    }
                }
            });
            Logger.info(`[CLOB] Persisted new credentials for ${user.wallet.address.slice(0, 8)}`);
        } catch (e) {
            Logger.error(`[CLOB] Failed to persist credentials: ${e}`);
        }
    }

    clobClientCache.set(cacheKey, client);
    return client;
};

const createClobClient = async (customPk?: string, proxyAddress?: string, creds?: any): Promise<ClobClient> => {
    const chainId = 137;
    const host = CLOB_HTTP_URL as string;
    const pk = customPk || PRIVATE_KEY;

    if (!pk) throw new Error('PRIVATE_KEY is required to create CLOB client');

    const wallet = new ethers.Wallet(pk as string);
    const signatureType = proxyAddress ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;

    return new ClobClient(
        host,
        chainId,
        wallet,
        creds,
        signatureType,
        proxyAddress,
        proxyAddress
    );
};

const createClobClientAndDerive = async (customPk?: string, proxyAddress?: string): Promise<{ client: ClobClient, creds: any }> => {
    const chainId = 137;
    const host = CLOB_HTTP_URL as string;
    const pk = customPk || PRIVATE_KEY;

    const wallet = new ethers.Wallet(pk as string);
    const signatureType = proxyAddress ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;
    
    Logger.info(`[CLOB] Deriving credentials for ${wallet.address.slice(0, 8)}...`);

    let clobClient = new ClobClient(
        host,
        chainId,
        wallet,
        undefined,
        signatureType,
        proxyAddress,
        proxyAddress
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

        const client = await createClobClient(customPk, proxyAddress, creds);
        return { client, creds };
    } finally {
        // Restore console functions
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }
};

export default createClobClient;
