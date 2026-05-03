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
import User from '../models/user.js';
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;
// Cache for CLOB clients
const clobClientCache = new Map();
/**
 * Attempts to find the Gnosis Safe proxy wallet linked to an EOA
 * by checking past trading activity on Polymarket.
 */
export const findProxyWallet = (eoaOrUser) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const eoa = typeof eoaOrUser === 'string' ? eoaOrUser : (_a = eoaOrUser === null || eoaOrUser === void 0 ? void 0 : eoaOrUser.wallet) === null || _a === void 0 ? void 0 : _a.address;
    if (!eoa)
        return null;
    // If it's a user object and has a manual proxy address, use it
    if (typeof eoaOrUser === 'object' && ((_b = eoaOrUser === null || eoaOrUser === void 0 ? void 0 : eoaOrUser.wallet) === null || _b === void 0 ? void 0 : _b.proxyAddress)) {
        return eoaOrUser.wallet.proxyAddress;
    }
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
    var _a, _b, _c, _d, _e;
    if (!((_a = user.wallet) === null || _a === void 0 ? void 0 : _a.privateKey))
        return null;
    const cacheKey = user.wallet.address.toLowerCase();
    if (clobClientCache.has(cacheKey))
        return clobClientCache.get(cacheKey);
    const detectedProxy = yield findProxyWallet(user);
    // Persist detected proxy to DB if not already saved
    if (detectedProxy && user.wallet && user.wallet.proxyAddress !== detectedProxy) {
        try {
            yield User.findByIdAndUpdate(user._id, {
                $set: { 'wallet.proxyAddress': detectedProxy }
            });
            user.wallet.proxyAddress = detectedProxy; // Update local object too
            Logger.info(`[PROXY] Persisted detected proxy for ${user.wallet.address.slice(0, 8)}: ${detectedProxy}`);
        }
        catch (e) {
            Logger.error(`[PROXY] Failed to persist proxy: ${e}`);
        }
    }
    // Check if we already have credentials in the DB
    if (((_c = (_b = user.wallet) === null || _b === void 0 ? void 0 : _b.clobCreds) === null || _c === void 0 ? void 0 : _c.key) && ((_e = (_d = user.wallet) === null || _d === void 0 ? void 0 : _d.clobCreds) === null || _e === void 0 ? void 0 : _e.secret)) {
        Logger.info(`[CLOB] Using persisted credentials for ${user.wallet.address.slice(0, 8)}`);
        const client = yield createClobClient(user.wallet.privateKey, detectedProxy || undefined, user.wallet.clobCreds);
        clobClientCache.set(cacheKey, client);
        return client;
    }
    const { client, creds } = yield createClobClientAndDerive(user.wallet.privateKey, detectedProxy || undefined);
    // Persist credentials to DB
    if (creds && user._id) {
        try {
            yield User.findByIdAndUpdate(user._id, {
                $set: {
                    'wallet.clobCreds': Object.assign(Object.assign({}, creds), { derivedAt: new Date() })
                }
            });
            Logger.info(`[CLOB] Persisted new credentials for ${user.wallet.address.slice(0, 8)}`);
        }
        catch (e) {
            Logger.error(`[CLOB] Failed to persist credentials: ${e}`);
        }
    }
    clobClientCache.set(cacheKey, client);
    return client;
});
const createClobClient = (customPk, proxyAddress, creds) => __awaiter(void 0, void 0, void 0, function* () {
    const chainId = 137;
    const host = CLOB_HTTP_URL;
    const pk = customPk || PRIVATE_KEY;
    if (!pk)
        throw new Error('PRIVATE_KEY is required to create CLOB client');
    const wallet = new ethers.Wallet(pk);
    const signatureType = proxyAddress ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;
    return new ClobClient(host, chainId, wallet, creds, signatureType, proxyAddress, proxyAddress);
});
const createClobClientAndDerive = (customPk, proxyAddress) => __awaiter(void 0, void 0, void 0, function* () {
    const chainId = 137;
    const host = CLOB_HTTP_URL;
    const pk = customPk || PRIVATE_KEY;
    const wallet = new ethers.Wallet(pk);
    const signatureType = proxyAddress ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;
    Logger.info(`[CLOB] Deriving credentials for ${wallet.address.slice(0, 8)}...`);
    let clobClient = new ClobClient(host, chainId, wallet, undefined, signatureType, proxyAddress, proxyAddress);
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
        const client = yield createClobClient(customPk, proxyAddress, creds);
        return { client, creds };
    }
    finally {
        // Restore console functions
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }
});
export default createClobClient;
