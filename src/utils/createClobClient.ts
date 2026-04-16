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
const isGnosisSafe = async (address: string): Promise<boolean> => {
    try {
        const provider = getProvider();
        const code = await provider.getCode(address);
        // If code is not "0x", then it's a contract (likely Gnosis Safe)
        return code !== '0x';
    } catch (error) {
        Logger.error(`Error checking wallet type: ${error}`);
        return false;
    }
};

const createClobClient = async (customPk?: string, customProxyWallet?: string): Promise<ClobClient> => {
    const chainId = 137;
    const host = CLOB_HTTP_URL as string;
    const pk = customPk || PRIVATE_KEY;
    const proxy = customProxyWallet || PROXY_WALLET;

    if (!pk) throw new Error('PRIVATE_KEY is required to create CLOB client');

    const wallet = new ethers.Wallet(pk as string);
    // Detect if the proxy wallet is a Gnosis Safe or EOA
    const isProxySafe = proxy ? await isGnosisSafe(proxy as string) : false;
    const signatureType = isProxySafe ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;

    Logger.info(
        `[CLOB] Creating client for ${wallet.address.slice(0, 8)}... (${isProxySafe ? 'Gnosis Safe' : 'EOA'})`
    );

    let clobClient = new ClobClient(
        host,
        chainId,
        wallet,
        undefined,
        signatureType,
        isProxySafe ? (proxy as string) : undefined
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
            isProxySafe ? (proxy as string) : undefined
        );
    } finally {
        // Restore console functions
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }

    return clobClient;
};

export default createClobClient;
