import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { ClobClient, Chain, SignatureTypeV2 } from '@polymarket/clob-client-v2';
import { ENV } from '../config/env.js';
import Logger from './logger.js';
import fetchData from './fetchData.js';
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL || 'https://clob.polymarket.com/';
const clobClientCache = new Map();
export const findProxyWallet = async (eoaOrUser) => {
    const eoa = typeof eoaOrUser === 'string' ? eoaOrUser : eoaOrUser?.wallet?.address;
    if (!eoa)
        return null;
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
    }
    catch (e) {
        Logger.error(`[PROXY] Error detecting proxy for ${eoa}: ${e}`);
    }
    return null;
};
export const getClobClientForUser = async (user) => {
    if (!user.wallet?.privateKey)
        return null;
    const cacheKey = user.wallet.address.toLowerCase();
    if (clobClientCache.has(cacheKey))
        return clobClientCache.get(cacheKey);
    const detectedProxy = await findProxyWallet(user);
    const client = await createClobClient(user.wallet.privateKey, detectedProxy || undefined);
    clobClientCache.set(cacheKey, client);
    return client;
};
const createClobClient = async (customPk, proxyAddress) => {
    const host = CLOB_HTTP_URL;
    const pk = (customPk || PRIVATE_KEY);
    if (!pk)
        throw new Error('PRIVATE_KEY is required to create CLOB client');
    const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
    const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(ENV.RPC_URL)
    });
    // In V2, SignatureTypeV2.POLY_GNOSIS_SAFE is often used for Gnosis Safe
    const signatureType = proxyAddress ? SignatureTypeV2.POLY_GNOSIS_SAFE : SignatureTypeV2.EOA;
    Logger.info(`[CLOB] Initializing for ${account.address} with SigType: ${signatureType}`);
    let client = new ClobClient({
        host,
        chain: Chain.POLYGON,
        signer: walletClient,
        signatureType,
    });
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = function () { };
    console.error = function () { };
    try {
        const creds = await client.createOrDeriveApiKey();
        client = new ClobClient({
            host,
            chain: Chain.POLYGON,
            signer: walletClient,
            creds,
            signatureType,
        });
    }
    finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }
    return client;
};
export default createClobClient;
