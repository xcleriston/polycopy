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
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ENV } from '../config/env.js';
import Logger from './logger.js';
import fetchData from './fetchData.js';
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;
// Cache for CLOB clients
const clobClientCache = new Map();
/**
 * Attempts to find the Gnosis Safe proxy wallet linked to an EOA
 * by checking past trading activity on Polymarket.
 */
export const findProxyWallet = (eoa) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const url = `https://data-api.polymarket.com/activity?user=${eoa.toLowerCase()}&type=TRADE`;
        const activities = yield fetchData(url);
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
});
export const getClobClientForUser = (user) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = user.wallet) === null || _a === void 0 ? void 0 : _a.privateKey))
        return null;
    const cacheKey = user.wallet.address.toLowerCase();
    if (clobClientCache.has(cacheKey))
        return clobClientCache.get(cacheKey);
    // Detect proxy wallet for this user
    const detectedProxy = yield findProxyWallet(user.wallet.address);
    const client = yield createClobClient(user.wallet.privateKey, detectedProxy || undefined);
    clobClientCache.set(cacheKey, client);
    return client;
});
const createClobClient = (customPk, proxyAddress) => __awaiter(void 0, void 0, void 0, function* () {
    const chainId = 137;
    const host = CLOB_HTTP_URL;
    const pk = customPk || PRIVATE_KEY;
    if (!pk)
        throw new Error('PRIVATE_KEY is required to create CLOB client');
    const wallet = new ethers.Wallet(pk);
    const signatureType = SignatureType.EOA;
    Logger.info(`[CLOB] Creating EOA client for ${wallet.address.slice(0, 8)}${proxyAddress ? ` (Proxy: ${proxyAddress.slice(0, 8)})` : ''}...`);
    let clobClient = new ClobClient(host, chainId, wallet, undefined, signatureType, undefined, proxyAddress // Set proxyAddress if found
    );
    // Suppress console output during API key creation
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = function () { };
    console.error = function () { };
    try {
        let creds = yield clobClient.createApiKey();
        if (!creds.key) {
            creds = yield clobClient.deriveApiKey();
        }
        clobClient = new ClobClient(host, chainId, wallet, creds, signatureType, undefined, proxyAddress);
    }
    finally {
        // Restore console functions
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }
    return clobClient;
});
export default createClobClient;
