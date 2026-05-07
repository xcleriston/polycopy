import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import clobConfig from '@polymarket/clob-client/dist/config.js';
import { ENV } from '../config/env.js';
import Logger from './logger.js';
import fetchData from './fetchData.js';
import User from '../models/user.js';

const PRIVATE_KEY = ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;

// ---------------------------------------------------------------------------
// PATCH: the bundled @polymarket/clob-client (4.22.8 / 5.8.1) hardcodes the
// legacy CTF Exchange v1 contract `0x4bFb41…`, but Polymarket has migrated to
// CTF Exchange v2 at `0xe2222d2…`. Orders signed against the v1 verifyingContract
// are rejected by the API as `order_version_mismatch`. We mutate the lib's
// MATIC_CONTRACTS object in-place so every subsequent call routes to v2.
// Source addresses come from the user's own Polymarket allowance set
// (USDC.allowance(proxy, 0xe2222d…) was infinite, USDC.allowance(proxy, 0x4bFb…)
// was 0 — definitive proof of the migration).
// ---------------------------------------------------------------------------
const EXCHANGE_V1 = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_EXCHANGE_V1 = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
// V2 deploy (cutover Polymarket 2026-04-28). Endereços confirmados via on-chain
// allowance set + clob-client-v2/getContractConfig.
const EXCHANGE_V2 = '0xE111180000d2663C0091e4f400237545B87B996B';
const NEG_RISK_EXCHANGE_V2 = '0xe2222d279d744050d28e00520010520000310F59';

export const KNOWN_EXCHANGES = {
    v1: EXCHANGE_V1,
    v2: EXCHANGE_V2,
    negRiskV1: NEG_RISK_EXCHANGE_V1,
    negRiskV2: NEG_RISK_EXCHANGE_V2,
};

/**
 * Mutates the lib's contract config. Affects ALL future order signing.
 * Returns the previous values so callers can restore them.
 */
export const setExchangeAddresses = (exchange?: string, negRiskExchange?: string) => {
    try {
        const m: any = (clobConfig as any).getContractConfig
            ? (clobConfig as any).getContractConfig(137)
            : (clobConfig as any).default?.getContractConfig?.(137);
        if (!m) return null;
        const prev = { exchange: m.exchange, negRiskExchange: m.negRiskExchange };
        if (exchange) m.exchange = exchange;
        if (negRiskExchange) m.negRiskExchange = negRiskExchange;
        return prev;
    } catch (e) {
        Logger.error(`[CLOB] setExchangeAddresses failed: ${e}`);
        return null;
    }
};

// Default to v1 (lib's native config). The fallback matrix in postOrder will
// switch to v2 only if v1 fails with order_version_mismatch — this avoids
// breaking working users while still resolving the v2-migrated cases.
Logger.info(`[CLOB] Default exchange: v1=${EXCHANGE_V1.slice(0, 10)}… (v2 used only as fallback)`);

// Cache for CLOB clients keyed by `${eoa}:${signatureType}`
// so we can hold both POLY_PROXY and POLY_GNOSIS_SAFE clients per user
// for transparent fallback on order_version_mismatch.
const clobClientCache: Map<string, ClobClient> = new Map();

/** Cache of detected proxy signature types: 0 = EOA, 1 = POLY_PROXY, 2 = POLY_GNOSIS_SAFE. */
const proxyTypeCache: Map<string, 0 | 1 | 2 | 3> = new Map();

// Try multiple Polygon RPCs in order — public endpoints rate-limit and
// occasionally drop, so the diagnosis must not depend on a single one.
const FALLBACK_RPCS = [
    'https://polygon-rpc.com',
    'https://polygon.llamarpc.com',
    'https://1rpc.io/matic',
    'https://rpc.ankr.com/polygon',
    'https://polygon-bor-rpc.publicnode.com',
];

const buildProvider = (url: string) => {
    try {
        return new ethers.providers.JsonRpcProvider({ url, skipFetchSetup: true } as any, 137);
    } catch (_) {
        return null;
    }
};

const providers: ethers.providers.JsonRpcProvider[] = [];
const seedProviders = () => {
    if (providers.length > 0) return providers;
    const urls = [ENV.RPC_URL, ...FALLBACK_RPCS].filter(Boolean) as string[];
    for (const u of urls) {
        const p = buildProvider(u);
        if (p) providers.push(p);
    }
    return providers;
};
seedProviders();

// Backwards-compat: first provider only (used elsewhere).
const polygonProvider = providers[0] || null;

/** Try a contract call across every RPC until one answers. */
export const callMultiRpc = async <T>(addr: string, abi: string[], fn: string, ...args: any[]): Promise<T | null> => {
    const list = seedProviders();
    for (const p of list) {
        try {
            const c = new ethers.Contract(addr, abi, p);
            const r = await Promise.race([
                (c as any)[fn](...args),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
            ]);
            return r as T;
        } catch (_) { /* try next */ }
    }
    return null;
};

/**
 * Compute the deterministic Polymarket proxy address for an EOA by calling
 * the Polymarket Proxy Factory. This is the SAME address that py-clob-client
 * computes locally — derived via CREATE2 with the EOA as salt. Going through
 * the factory's view method is more robust than reproducing the CREATE2 math
 * because the factory abstracts away version differences.
 *
 * Tries multiple known factory ABIs:
 *   - Polymarket Proxy Factory v1: `getSafeAddress(address) view returns (address)`
 *   - Polymarket Proxy Factory v2: `getProxy(address) view returns (address)`
 *   - Generic predict: `predictDeterministicAddress(...)` (OpenZeppelin clones)
 *
 * Returns the lowercased proxy address, or null if no factory answers.
 */
const POLYMARKET_PROXY_FACTORY = '0xaB45c5A4B0c941a2F231C04C3f49182e1A254052';
const POLYMARKET_SAFE_FACTORY = '0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b';

export const computePolymarketProxy = async (eoa: string): Promise<string | null> => {
    const candidates: { factory: string; abi: string[]; method: string }[] = [
        { factory: POLYMARKET_PROXY_FACTORY, abi: ['function getSafeAddress(address) view returns (address)'], method: 'getSafeAddress' },
        { factory: POLYMARKET_PROXY_FACTORY, abi: ['function getProxy(address) view returns (address)'], method: 'getProxy' },
        { factory: POLYMARKET_PROXY_FACTORY, abi: ['function proxyOf(address) view returns (address)'], method: 'proxyOf' },
        { factory: POLYMARKET_SAFE_FACTORY, abi: ['function getSafeAddress(address) view returns (address)'], method: 'getSafeAddress' },
        { factory: POLYMARKET_SAFE_FACTORY, abi: ['function getProxy(address) view returns (address)'], method: 'getProxy' },
    ];
    for (const c of candidates) {
        const result = await callMultiRpc<string>(c.factory, c.abi, c.method, eoa);
        if (result && typeof result === 'string' && result !== ethers.constants.AddressZero) {
            const r = result.toLowerCase();
            Logger.info(`[PROXY] Computed via ${c.factory.slice(0,10)}.${c.method}(${eoa.slice(0,10)}) → ${r}`);
            return r;
        }
    }
    return null;
};

/**
 * Read on-chain who actually controls a Polymarket proxy. Polymarket Proxies
 * expose `wallet()` returning the owner EOA. Gnosis Safes expose
 * `getOwners()` returning the array of owners.
 *
 * Returns the lowercased owner address, or null if unreadable.
 */
export const readProxyOwner = async (proxyAddress: string): Promise<string | null> => {
    // Polymarket Proxy: wallet() returns the EOA owner
    const w = await callMultiRpc<string>(proxyAddress, ['function wallet() view returns (address)'], 'wallet');
    if (w && typeof w === 'string' && w !== ethers.constants.AddressZero) {
        return w.toLowerCase();
    }
    // Gnosis Safe: getOwners()[0]
    const owners = await callMultiRpc<string[]>(proxyAddress, ['function getOwners() view returns (address[])'], 'getOwners');
    if (Array.isArray(owners) && owners.length > 0) {
        return owners[0].toLowerCase();
    }
    return null;
};

/**
 * Detect what kind of proxy contract sits behind a Polymarket "proxy" address:
 *   - 1 (POLY_PROXY)        — Polymarket's email/Google signup proxy
 *   - 2 (POLY_GNOSIS_SAFE)  — true Gnosis Safe (typically MetaMask flow)
 *
 * Strategy: probe Gnosis Safe specific functions. If they answer, it's a Safe.
 * Otherwise default to POLY_PROXY (the most common case for users that
 * onboarded via the Polymarket website).
 */
export const detectProxyType = async (proxyAddress: string): Promise<1 | 2 | 3> => {
    const key = proxyAddress.toLowerCase();
    if (proxyTypeCache.has(key)) {
        const v = proxyTypeCache.get(key)!;
        if (v !== 0) return v as 1 | 2;
    }

    if (!polygonProvider) {
        Logger.warning('[PROXY] No RPC provider — defaulting to POLY_PROXY');
        proxyTypeCache.set(key, 1);
        return 1;
    }

    // V2 Polymarket Deposit Wallet (POLY_1271, sigType=3) — usa ERC-7739 nested sig.
    // Detecta via ERC-5267 eip712Domain() — name == "DepositWallet". Esse é o caso
    // mais comum em V2 e tem prioridade sobre Safe / EIP-1167 (que são fallbacks pré-cutover).
    try {
        const eip5267Abi = [
            'function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])',
        ];
        const c = new ethers.Contract(proxyAddress, eip5267Abi, polygonProvider);
        const r: any = await Promise.race([
            c.eip712Domain().catch(() => null),
            new Promise((res) => setTimeout(() => res(null), 4000)),
        ]);
        if (Array.isArray(r) && r[1] === 'DepositWallet') {
            Logger.info(`[PROXY] Detected POLY_1271 DepositWallet at ${proxyAddress.slice(0, 8)} → sigType=3 (V2)`);
            proxyTypeCache.set(key, 3);
            return 3;
        }
    } catch (_) { /* fall through */ }

    try {
        // Gnosis Safe exposes getOwners() and VERSION(); Polymarket Proxy does not.
        const safeAbi = [
            'function getOwners() view returns (address[])',
            'function VERSION() view returns (string)'
        ];
        const safe = new ethers.Contract(proxyAddress, safeAbi, polygonProvider);
        const probe: any = await Promise.race([
            safe.getOwners().catch(() => null),
            new Promise((res) => setTimeout(() => res(null), 4000))
        ]);
        if (Array.isArray(probe) && probe.length > 0) {
            Logger.info(`[PROXY] Detected POLY_GNOSIS_SAFE at ${proxyAddress.slice(0, 8)}`);
            proxyTypeCache.set(key, 2);
            return 2;
        }
    } catch (_) { /* fall through */ }

    // Detect EIP-1167 minimal proxy (Polymarket Safe via Privy/embedded wallet).
    // The bytecode for an EIP-1167 clone always starts with `363d3d373d3d3d363d73`.
    // Polymarket uses signature_type=3 for these (observed live in their UI traffic).
    try {
        for (const p of seedProviders()) {
            const code: any = await Promise.race([
                p.getCode(proxyAddress),
                new Promise((_, rej) => setTimeout(() => rej(new Error('to')), 4000))
            ]).catch(() => null);
            if (typeof code === 'string' && code.toLowerCase().startsWith('0x363d3d373d3d3d363d73')) {
                Logger.info(`[PROXY] Detected POLY_SAFE/Privy (EIP-1167 clone) at ${proxyAddress.slice(0, 8)} → sigType=3`);
                proxyTypeCache.set(key, 3);
                return 3;
            }
            if (typeof code === 'string' && code !== '0x') break; // got a response, just not a clone
        }
    } catch (_) { /* fall through */ }

    Logger.info(`[PROXY] Detected POLY_PROXY (Polymarket signup) at ${proxyAddress.slice(0, 8)}`);
    proxyTypeCache.set(key, 1);
    return 1;
};

/**
 * Resolve the proxy wallet for an EOA. Order of attempts:
 *   1. User-set manual override (wallet.proxyAddress)
 *   2. Deterministic computation via factory.getSafeAddress(eoa) — CORRECT
 *   3. Activity API as last resort (UNRELIABLE — may return counterparty proxies)
 */
export const findProxyWallet = async (eoaOrUser: string | any): Promise<string | null> => {
    const eoa = typeof eoaOrUser === 'string' ? eoaOrUser : eoaOrUser?.wallet?.address;
    if (!eoa) return null;

    // 1. Honor a manually-set proxy
    if (typeof eoaOrUser === 'object' && eoaOrUser?.wallet?.proxyAddress) {
        return eoaOrUser.wallet.proxyAddress;
    }

    // 2. Deterministic on-chain derivation (the right way)
    try {
        const computed = await computePolymarketProxy(eoa);
        if (computed) return computed;
    } catch (e) {
        Logger.warning(`[PROXY] Factory derivation failed: ${e}`);
    }

    // 3. Fallback: scan recent trades (CAN BE WRONG — picks counterparty proxy)
    try {
        const url = `https://data-api.polymarket.com/activity?user=${eoa.toLowerCase()}&type=TRADE`;
        const activities = await fetchData(url);
        if (Array.isArray(activities) && activities.length > 0) {
            const proxy = activities[0].proxyWallet;
            if (proxy && proxy.toLowerCase() !== eoa.toLowerCase()) {
                Logger.warning(`[PROXY] Activity-fallback for ${eoa.slice(0, 6)}: ${proxy} — VERIFY this is correct (factory derivation failed)`);
                return proxy;
            }
        }
    } catch (e) {
        Logger.error(`[PROXY] Activity API also failed for ${eoa}: ${e}`);
    }
    return null;
};

/**
 * Returns a CLOB client configured for the user, with the *correct*
 * proxy signature type. Persists detected info to Mongo for next boot.
 */
export const getClobClientForUser = async (user: any): Promise<ClobClient | null> => {
    if (!user.wallet?.privateKey) return null;

    const detectedProxy = await findProxyWallet(user);

    let sigType: 0 | 1 | 2;
    if (detectedProxy) {
        const persisted = user.wallet?.proxySignatureType;
        // Honor persisted sigType ∈ {0,1,2}. Coerce legacy `3` to `2` (Safe)
        // since `py_order_utils` only defines 0,1,2 and 3 was an experiment.
        if (persisted === 1 || persisted === 2) {
            sigType = persisted;
        } else if (persisted === 0) {
            sigType = 0;
        } else if (persisted === 3) {
            sigType = 2;
            try {
                await User.findByIdAndUpdate(user._id, { $set: { 'wallet.proxySignatureType': 2 } });
                user.wallet.proxySignatureType = 2;
                Logger.info('[CLOB] Auto-corrected stale sigType=3 → 2 (POLY_GNOSIS_SAFE)');
            } catch (_) { /* best-effort */ }
        } else {
            const detected = await detectProxyType(detectedProxy);
            sigType = detected === 3 ? 2 : (detected as 0 | 1 | 2);
            try {
                await User.findByIdAndUpdate(user._id, {
                    $set: { 'wallet.proxySignatureType': sigType }
                });
                user.wallet.proxySignatureType = sigType;
            } catch (_) { /* best-effort */ }
        }
    } else {
        sigType = 0;
    }

    if (detectedProxy && user.wallet?.proxyAddress !== detectedProxy) {
        try {
            await User.findByIdAndUpdate(user._id, {
                $set: { 'wallet.proxyAddress': detectedProxy }
            });
            user.wallet.proxyAddress = detectedProxy;
        } catch (_) { /* best-effort */ }
    }

    // CLOB API credentials are bound to (EOA, sigType, funder) at creation.
    // If we have stale creds from a different sigType, wipe them so the next
    // step derives fresh ones — otherwise every order is rejected with
    // order_version_mismatch because the api-key's owner != order.maker.
    const persistedSigType = (user.wallet as any)?.clobCreds?.derivedSigType;
    if (user.wallet?.clobCreds?.key && persistedSigType !== undefined && persistedSigType !== sigType) {
        Logger.warning(`[CLOB_DEBUG] Stale clobCreds: derived for sigType=${persistedSigType}, current=${sigType}. Re-deriving.`);
        try {
            await User.findByIdAndUpdate(user._id, { $unset: { 'wallet.clobCreds': 1 } });
            (user.wallet as any).clobCreds = undefined;
            // Drop any cached client so the next call rebuilds
            const eoaKey = user.wallet.address.toLowerCase();
            for (const k of Array.from(clobClientCache.keys())) {
                if (k.startsWith(eoaKey + ':')) clobClientCache.delete(k);
            }
        } catch (_) { /* best-effort */ }
    }

    return getClobClientForUserWithSigType(user, sigType, detectedProxy || undefined);
};

/**
 * Build (or retrieve from cache) a CLOB client for a user, forcing a
 * specific signatureType. Used by postOrder to retry on
 * `order_version_mismatch`.
 */
export const getClobClientForUserWithSigType = async (
    user: any,
    sigType: 0 | 1 | 2 | 3,
    knownProxy?: string,
    forceFreshCreds: boolean = false
): Promise<ClobClient | null> => {
    if (!user.wallet?.privateKey) return null;
    const cacheKey = `${user.wallet.address.toLowerCase()}:${sigType}`;
    if (!forceFreshCreds && clobClientCache.has(cacheKey)) return clobClientCache.get(cacheKey)!;

    const proxy = knownProxy || (sigType !== 0 ? user.wallet.proxyAddress : undefined);

    if (!forceFreshCreds && user.wallet?.clobCreds?.key && user.wallet?.clobCreds?.secret) {
        const client = await createClobClient(user.wallet.privateKey, proxy, user.wallet.clobCreds, sigType);
        clobClientCache.set(cacheKey, client);
        return client;
    }

    Logger.info(`[CLOB_DEBUG] Deriving FRESH creds for sigType=${sigType}, proxy=${proxy ? proxy.slice(0,10) + '…' : 'none'}`);
    const { client, creds } = await createClobClientAndDerive(user.wallet.privateKey, proxy, sigType);
    if (creds && user._id) {
        try {
            await User.findByIdAndUpdate(user._id, {
                $set: { 'wallet.clobCreds': { ...creds, derivedAt: new Date(), derivedSigType: sigType } }
            });
            user.wallet.clobCreds = { ...creds, derivedAt: new Date() };
        } catch (_) { /* best-effort */ }
    }
    clobClientCache.set(cacheKey, client);
    return client;
};

/** Force a re-derivation of API creds for the given user. Useful when sigType
 *  was wrong before and we need fresh credentials bound to the new identity. */
export const refreshClobCreds = async (user: any, sigType: 0 | 1 | 2 | 3): Promise<void> => {
    if (!user?._id) return;
    try {
        await User.findByIdAndUpdate(user._id, { $unset: { 'wallet.clobCreds': 1 } });
        if (user.wallet) user.wallet.clobCreds = undefined;
        clobClientCache.clear();
    } catch (_) { /* best-effort */ }
};

/** Persist a corrected signatureType after a successful retry. */
export const persistProxySignatureType = async (user: any, sigType: 0 | 1 | 2 | 3): Promise<void> => {
    try {
        await User.findByIdAndUpdate(user._id, {
            $set: { 'wallet.proxySignatureType': sigType }
        });
        if (user.wallet) user.wallet.proxySignatureType = sigType;
        if (user.wallet?.proxyAddress) {
            proxyTypeCache.set(user.wallet.proxyAddress.toLowerCase(), sigType);
        }
    } catch (_) { /* best-effort */ }
};

const sigTypeToEnum = (t: 0 | 1 | 2 | 3): SignatureType => {
    // Per py_order_utils/model/signatures.py — only 3 sigTypes exist for
    // Polymarket orders. Treat 3 as 2 (POLY_GNOSIS_SAFE) to fix any stale
    // DB state without forcing the user to manually reset.
    if (t === 1) return SignatureType.POLY_PROXY as any;
    if (t === 2 || t === 3) return SignatureType.POLY_GNOSIS_SAFE as any;
    return SignatureType.EOA as any;
};

const createClobClient = async (
    customPk?: string,
    proxyAddress?: string,
    creds?: any,
    signatureType?: 0 | 1 | 2 | 3
): Promise<ClobClient> => {
    const chainId = 137;
    const host = CLOB_HTTP_URL as string;
    const pk = customPk || PRIVATE_KEY;

    if (!pk) throw new Error('PRIVATE_KEY is required to create CLOB client');

    const wallet = new ethers.Wallet(pk as string);
    const sigType: 0 | 1 | 2 | 3 = signatureType !== undefined
        ? signatureType
        : (proxyAddress ? 2 : 0);

    return new ClobClient(
        host,
        chainId,
        wallet,
        creds,
        sigTypeToEnum(sigType),
        proxyAddress,
        proxyAddress
    );
};

const createClobClientAndDerive = async (
    customPk?: string,
    proxyAddress?: string,
    signatureType?: 0 | 1 | 2 | 3
): Promise<{ client: ClobClient; creds: any }> => {
    const chainId = 137;
    const host = CLOB_HTTP_URL as string;
    const pk = customPk || PRIVATE_KEY;

    const wallet = new ethers.Wallet(pk as string);
    const sigType: 0 | 1 | 2 | 3 = signatureType !== undefined
        ? signatureType
        : (proxyAddress ? 2 : 0);

    Logger.info(`[CLOB] Deriving credentials for ${wallet.address.slice(0, 8)}... (sigType=${sigType})`);

    const clobClient = new ClobClient(
        host,
        chainId,
        wallet,
        undefined,
        sigTypeToEnum(sigType),
        proxyAddress,
        proxyAddress
    );

    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = function () {};
    console.error = function () {};

    try {
        let creds = await clobClient.createApiKey();
        if (!creds.key) {
            creds = await clobClient.deriveApiKey();
        }
        const client = await createClobClient(customPk, proxyAddress, creds, sigType);
        return { client, creds };
    } finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }
};

export default createClobClient;
