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
import { getProvider } from './rpcProvider.js';
const PROXY_WALLET = ENV.PROXY_WALLET;
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;
/**
 * Determines if a wallet is a Gnosis Safe by checking if it has contract code
 */
const isGnosisSafe = (address) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const provider = getProvider();
        const code = yield provider.getCode(address);
        // If code is not "0x", then it's a contract (likely Gnosis Safe)
        return code !== '0x';
    }
    catch (error) {
        Logger.error(`Error checking wallet type: ${error}`);
        return false;
    }
});
const createClobClient = (customPk, customProxyWallet) => __awaiter(void 0, void 0, void 0, function* () {
    const chainId = 137;
    const host = CLOB_HTTP_URL;
    const pk = customPk || PRIVATE_KEY;
    const proxy = customProxyWallet || PROXY_WALLET;
    if (!pk)
        throw new Error('PRIVATE_KEY is required to create CLOB client');
    const wallet = new ethers.Wallet(pk);
    // Detect if the proxy wallet is a Gnosis Safe or EOA
    const isProxySafe = proxy ? yield isGnosisSafe(proxy) : false;
    const signatureType = isProxySafe ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;
    Logger.info(`[CLOB] Creating client for ${wallet.address.slice(0, 8)}... (${isProxySafe ? 'Gnosis Safe' : 'EOA'})`);
    let clobClient = new ClobClient(host, chainId, wallet, undefined, signatureType, isProxySafe ? proxy : undefined);
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
        clobClient = new ClobClient(host, chainId, wallet, creds, signatureType, isProxySafe ? proxy : undefined);
    }
    finally {
        // Restore console functions
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }
    return clobClient;
});
export default createClobClient;
