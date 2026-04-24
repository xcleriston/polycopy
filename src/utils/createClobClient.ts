import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ENV } from '../config/env.js';
import Logger from './logger.js';

const PRIVATE_KEY = ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;

const createClobClient = async (customPk?: string, customProxyWallet?: string): Promise<ClobClient> => {
    const chainId = 137;
    const host = CLOB_HTTP_URL as string;
    const pk = customPk || PRIVATE_KEY;

    if (!pk) throw new Error('PRIVATE_KEY is required to create CLOB client');

    const wallet = new ethers.Wallet(pk as string);
    const signatureType = SignatureType.EOA;

    Logger.info(
        `[CLOB] Creating EOA client for ${wallet.address.slice(0, 8)}...`
    );

    let clobClient = new ClobClient(
        host,
        chainId,
        wallet,
        undefined,
        signatureType,
        undefined
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
            undefined
        );
    } finally {
        // Restore console functions
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }

    return clobClient;
};

export default createClobClient;
