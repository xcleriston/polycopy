import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { ClobClient, Chain, SignatureTypeV2 } from '@polymarket/clob-client-v2';
import { ENV } from '../config/env.js';
import Logger from './logger.js';
import fetchData from './fetchData.js';

const PRIVATE_KEY = ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL || 'https://clob.polymarket.com/';

const clobClientCache: Map<string, ClobClient> = new Map();

export interface ProxyInfo {
    address: string;
    type: SignatureTypeV2;
}

export const findProxyWallet = async (eoaOrUser: string | any): Promise<ProxyInfo | null> => {
    const eoa = typeof eoaOrUser === 'string' ? eoaOrUser : eoaOrUser?.wallet?.address;
    if (!eoa) return null;

    if (typeof eoaOrUser === 'object' && eoaOrUser?.wallet?.proxyAddress) {
        return { 
            address: eoaOrUser.wallet.proxyAddress, 
            type: SignatureTypeV2.POLY_GNOSIS_SAFE // Default for manual
        };
    }

    try {
        const url = `https://gamma-api.polymarket.com/public-profile?address=${eoa.toLowerCase()}`;
        const profile = await fetchData(url);
        if (profile && profile.proxyWallet && profile.proxyWallet.toLowerCase() !== eoa.toLowerCase()) {
            const proxy = profile.proxyWallet;
            const wType = (profile.walletType || "").toLowerCase();
            
            // Detect signature type based on profile walletType
            // Type 1 = POLY_PROXY (Email, Google, Magic)
            // Type 2 = POLY_GNOSIS_SAFE (MetaMask + Proxy)
            let type = SignatureTypeV2.POLY_GNOSIS_SAFE;
            if (wType.includes('magic') || wType.includes('email') || wType.includes('google')) {
                type = SignatureTypeV2.POLY_PROXY;
            }

            Logger.info(`[PROXY] Detected Proxy ${proxy} (Type: ${type}) for ${eoa.slice(0, 6)}`);
            return { address: proxy, type };
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

    const proxyInfo = await findProxyWallet(user);
    
    const client = await createClobClient(user.wallet.privateKey, proxyInfo?.address, proxyInfo?.type);
    clobClientCache.set(cacheKey, client);
    return client;
};

const createClobClient = async (customPk?: string, proxyAddress?: string, forcedSigType?: SignatureTypeV2): Promise<ClobClient> => {
    const host = CLOB_HTTP_URL;
    const pk = (customPk || PRIVATE_KEY) as `0x${string}`;

    if (!pk) throw new Error('PRIVATE_KEY is required to create CLOB client');

    const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
    const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(ENV.RPC_URL)
    });

    const signatureType = forcedSigType ?? (proxyAddress ? SignatureTypeV2.POLY_GNOSIS_SAFE : SignatureTypeV2.EOA);
    
    Logger.info(`[CLOB] Initializing for ${account.address} with SigType: ${signatureType}`);

    let client = new ClobClient({
        host,
        chain: Chain.POLYGON,
        signer: walletClient,
        signatureType,
    });

    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = function () {};
    console.error = function () {};

    try {
        const creds = await client.createOrDeriveApiKey();
        
        client = new ClobClient({
            host,
            chain: Chain.POLYGON,
            signer: walletClient,
            creds,
            signatureType,
        });
    } finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }

    return client;
};

export default createClobClient;
