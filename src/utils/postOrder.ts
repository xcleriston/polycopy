import { Side, OrderType } from "@polymarket/clob-client";
import User from "../models/user.js";
import { Activity } from "../models/userHistory.js";
import Logger from "./logger.js";
import telegram from "./telegram.js";
import { calculateOrderSize } from "../config/copyStrategy.js";
import {
    getClobClientForUserWithSigType,
    persistProxySignatureType,
    readProxyOwner,
    setExchangeAddresses,
    KNOWN_EXCHANGES
} from "./createClobClient.js";
import fetchData from "./fetchData.js";
// V1 manual signing path (signOrderManually + signOrderV2 antigos com schema inventado)
// foi removido pós-V2 cutover — não funciona mais. Tudo passa pelo PATH 0 (orderV2.ts)
// que usa o SDK oficial @polymarket/clob-client-v2.
import { createV2Client, detectSigType, submitOrderV2, OrderType as OrderTypeV2, SignatureTypeV2 } from "./orderV2.js";
import { Wallet as EthersWallet } from "ethers";
import { ENV } from "../config/env.js";

const extractOrderError = (resp: any): string => {
    if (!resp) return 'empty response';
    if (resp.error && typeof resp.error === 'string') {
        // Cloudflare HTML often gets pasted as the error — extract the code.
        if (resp.error.includes('cloudflare') || resp.error.includes('Cloudflare') || resp.error.includes('<!DOCTYPE')) {
            const m = resp.error.match(/Error code (\d+)/) || resp.error.match(/code-label">Error code (\d+)/);
            return `Polymarket CLOB upstream error${m ? ` (HTTP ${m[1]})` : ''} — Cloudflare`;
        }
        return resp.error;
    }
    if (resp.error) return JSON.stringify(resp.error);
    if (typeof resp === 'string') return resp;
    if (resp.message) return resp.message;
    return JSON.stringify(resp);
};

const isVersionMismatch = (errStr: string): boolean => {
    if (!errStr) return false;
    const s = errStr.toLowerCase();
    return s.includes('order_version_mismatch')
        || s.includes('version mismatch')
        || s.includes('invalid signature')
        || s.includes('signature mismatch');
};

const isTransient = (errStr: string): boolean => {
    if (!errStr) return false;
    const s = errStr.toLowerCase();
    return s.includes('cloudflare')
        || s.includes('520')
        || s.includes('522')
        || s.includes('524')
        || s.includes('503')
        || s.includes('econnreset')
        || s.includes('etimedout')
        || s.includes("cannot read properties of undefined (reading 'tostring')")
        || s.includes('reading \'tostring\'')
        || s.includes('socket hang up');
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Resilient prefetch of tickSize and negRisk for a given token. The clob-client
 * lib does this internally on every createOrder call but blows up with
 * `Cannot read properties of undefined (reading 'toString')` when Cloudflare
 * returns a 520 HTML page instead of JSON. We fetch with retries and pass the
 * values back via `options` so the lib never has to call its own broken path.
 */
const resilientTickSizeAndNegRisk = async (
    clobClient: any,
    tokenID: string,
    followerId: string
): Promise<{ tickSize: string; negRisk: boolean }> => {
    let tickSize: string | null = null;
    let negRisk: boolean | null = null;

    // Cache hits inside the lib are fine and free.
    try {
        if ((clobClient as any).tickSizes && tokenID in (clobClient as any).tickSizes) {
            tickSize = (clobClient as any).tickSizes[tokenID];
        }
        if ((clobClient as any).negRisk && tokenID in (clobClient as any).negRisk) {
            negRisk = (clobClient as any).negRisk[tokenID];
        }
    } catch (_) { /* ignore */ }

    // 1) Try the CLOB endpoint with retries.
    const attempts = 4;
    for (let i = 0; i < attempts && (tickSize == null || negRisk == null); i++) {
        try {
            if (tickSize == null) {
                const r: any = await fetchData(`https://clob.polymarket.com/tick-size?token_id=${tokenID}`);
                if (r && r.minimum_tick_size !== undefined && r.minimum_tick_size !== null) {
                    tickSize = String(r.minimum_tick_size);
                }
            }
            if (negRisk == null) {
                const r: any = await fetchData(`https://clob.polymarket.com/neg-risk?token_id=${tokenID}`);
                if (r && r.neg_risk !== undefined && r.neg_risk !== null) {
                    negRisk = !!r.neg_risk;
                }
            }
        } catch (e: any) {
            Logger.warning(`[CLOB] [${followerId}] tickSize/negRisk fetch attempt ${i + 1} failed: ${e?.message || e}`);
        }
        if (tickSize == null || negRisk == null) {
            await sleep(400 * (i + 1));
        }
    }

    // 2) Fallback to gamma-api (different infra, less likely to be down).
    if (tickSize == null || negRisk == null) {
        try {
            const r: any = await fetchData(`https://gamma-api.polymarket.com/markets?clob_token_ids=${tokenID}`);
            const arr = Array.isArray(r) ? r : (r?.data || []);
            if (Array.isArray(arr) && arr.length > 0) {
                const m = arr[0];
                if (tickSize == null && m.minimumTickSize !== undefined) tickSize = String(m.minimumTickSize);
                if (negRisk == null && m.negRisk !== undefined) negRisk = !!m.negRisk;
            }
        } catch (_) { /* ignore */ }
    }

    // 3) Sane defaults so we never explode in the lib.
    //    Most Polymarket markets are 0.01 tickSize and not neg-risk.
    if (tickSize == null) {
        tickSize = '0.01';
        Logger.warning(`[CLOB] [${followerId}] tickSize fallback to 0.01 for ${tokenID.slice(0, 12)}…`);
    }
    if (negRisk == null) {
        negRisk = false;
    }

    // Hydrate the lib's internal cache so other callers benefit.
    try {
        (clobClient as any).tickSizes[tokenID] = tickSize;
        (clobClient as any).negRisk[tokenID] = negRisk;
    } catch (_) { /* ignore */ }

    return { tickSize, negRisk };
};

export const recordStatus = async (
    activityId: string,
    followerId: string,
    status: string,
    details?: string,
    extra?: Record<string, any>
) => {
    try {
        const { processed, myEntryPrice, myEntryAmount, ...restExtra } = extra || {};
        const dashboardData = {
            status,
            details,
            timestamp: new Date(),
            price: myEntryPrice,
            myEntryPrice,
            entryPrice: myEntryPrice,
            executedPrice: myEntryPrice,
            amount: myEntryAmount,
            myEntryAmount,
            value: myEntryAmount,
            pnl: extra?.pnl || 0,
            profit: extra?.profit || 0,
            percentPnl: extra?.percentPnl || 0,
            ...restExtra
        };

        const updateData: any = { [`followerStatuses.${followerId}`]: dashboardData };
        const updateQuery: any = { $set: updateData };
        if (processed) {
            updateQuery.$addToSet = { processedBy: followerId };
        }
        await Activity.updateOne({ _id: activityId }, updateQuery);
        Logger.info(`[STATUS] Recorded "${status}" for ${followerId}`);
    } catch (e) {
        Logger.error(`[ERROR] Failed to record status: ${e}`);
    }
};

/**
 * Sign and post an order with automatic fallback on order_version_mismatch.
 *
 * Polymarket has 3 wallet types:
 *   - SignatureType 0: EOA (no proxy)
 *   - SignatureType 1: POLY_PROXY (Polymarket email/Google signup)
 *   - SignatureType 2: POLY_GNOSIS_SAFE (Gnosis Safe via MetaMask)
 *
 * We can't tell email-signup from MetaMask just from the proxy address —
 * detectProxyType() probes Gnosis Safe specific functions on-chain. If that
 * heuristic is wrong, the API returns `order_version_mismatch`. This function
 * catches that, swaps signature type, retries once, and persists the corrected
 * type so future orders go through on the first try.
 */
const signAndPost = async (
    initialClient: any,
    user: any,
    initialSigType: 0 | 1 | 2 | 3,
    proxyAddress: string | undefined,
    orderArgs: any,
    isMarket: boolean,
    followerId: string
): Promise<{ success: boolean; orderID?: string; error?: string }> => {
    // Pre-fetch tickSize / negRisk resiliently and pass them via options so the
    // clob-client never has to call its own (broken on Cloudflare 520) path.
    const tokenID = orderArgs.tokenID;
    if (!tokenID) {
        return { success: false, error: 'tokenID ausente no trade — chain monitor não populou trade.asset' };
    }
    // GUARD: if the caller mistakenly passes the EOA as proxyAddress, the
    // (sigType=1/2 + maker=EOA) combo is invalid and the API rejects it as
    // `order_version_mismatch`. Treat it as no-proxy.
    if (proxyAddress && user?.wallet?.address
        && proxyAddress.toLowerCase() === user.wallet.address.toLowerCase()) {
        Logger.warning(`[ORDER_DEBUG] [${followerId}] proxyAddress equals EOA — switching to EOA-only mode (sigType=0)`);
        proxyAddress = undefined;
        initialSigType = 0;
    }

    // PRE-FLIGHT: skip se sigType já cached em User — significa que esse user
    // já passou pela detecção em algum trade anterior, então a EOA controla o
    // proxy. Re-checar a cada copy adiciona ~0.5–4s de RPC + zero benefício.
    // Pra wallets novas (sigType ausente), valida 1x.
    const sigTypeCached = user?.wallet?.proxySignatureType;
    if (proxyAddress && user?.wallet?.address && (sigTypeCached === undefined || sigTypeCached === null)) {
        const eoa = user.wallet.address.toLowerCase();
        const owner = await readProxyOwner(proxyAddress);
        if (owner && owner !== eoa) {
            const msg = `Proxy ${proxyAddress.slice(0,10)}… é controlado por ${owner.slice(0,10)}…, mas a EOA importada é ${eoa.slice(0,10)}… → impossível assinar ordens. Importe a chave privada da EOA correta.`;
            Logger.error(`[ORDER] [${followerId}] PRE-FLIGHT: ${msg}`);
            return { success: false, error: msg };
        }
        if (!owner) {
            Logger.warning(`[ORDER] [${followerId}] PRE-FLIGHT: Could not read proxy owner on-chain (RPC down?). Continuing anyway.`);
        } else {
            Logger.info(`[ORDER] [${followerId}] PRE-FLIGHT: ✓ EOA ${eoa.slice(0,10)}… controls proxy ${proxyAddress.slice(0,10)}…`);
        }
    }

    // PATH 0 V2 cuida do tickSize/negRisk internamente (clob-client-v2 cacheia).
    // Esse pre-fetch só é usado se PATH 0 falhar e cair pro fallback V1 (raro).
    // Lazy: só busca se necessário (default = sem await aqui).
    let tickSizeCached: string | null = null;
    let detectedNegRiskCached: boolean | null = null;
    const ensureTickAndNegRisk = async () => {
        if (tickSizeCached !== null && detectedNegRiskCached !== null) {
            return { tickSize: tickSizeCached, negRisk: detectedNegRiskCached };
        }
        const r = await resilientTickSizeAndNegRisk(initialClient, tokenID, followerId);
        tickSizeCached = r.tickSize;
        detectedNegRiskCached = r.negRisk;
        return r;
    };
    // PATH 0 ainda precisa do tickSize/negRisk pra rounding correto. Buscamos
    // já — mas como cache hit interno é instant, não há cost real após 1ª copy.
    const { tickSize, negRisk: detectedNegRisk } = await ensureTickAndNegRisk();

    // ---------------------------------------------------------------------
    // PATH 0: @polymarket/clob-client-v2 oficial (V2 cutover 2026-04-28).
    // Esta é a SDK oficial; cobre o schema V2 inteiro (timestamp/metadata/builder),
    // domain version="2", ERC-7739 nested sig pra POLY_1271 (Deposit Wallet),
    // rounding correto (MARKET vs LIMIT). Substitui o signOrderV2.ts antigo (que
    // tinha wrapping inventado e não funcionava).
    // ---------------------------------------------------------------------
    Logger.info(`[ORDER_V2_GATE] [${followerId}] proxy=${!!proxyAddress} privKey=${!!user?.wallet?.privateKey} creds=${!!user?.wallet?.clobCreds?.key}`);
    const credsForV2 = user?.wallet?.clobCreds || (initialClient as any)?.creds;
    if (user?.wallet?.privateKey && credsForV2?.key) {
        const t0 = Date.now();
        try {
            const sideStr: 'BUY' | 'SELL' = orderArgs.side === 0 || orderArgs.side === Side.BUY ? 'BUY' : 'SELL';
            const tickSizeV2 = (tickSize as '0.1' | '0.01' | '0.001' | '0.0001');
            // sigType: usa o cacheado em User; senao detecta on-chain (1 RPC call).
            // Se não tem proxy, modo EOA-direct (sigType=0).
            const funderForV2 = proxyAddress ?? user.wallet.address!;
            const cachedSig = user.wallet.proxySignatureType;
            let sigTypeV2: SignatureTypeV2;
            if (cachedSig === 0 || cachedSig === 1 || cachedSig === 2 || cachedSig === 3) {
                sigTypeV2 = cachedSig as SignatureTypeV2;
            } else {
                const det = await detectSigType((ENV as any).RPC_HTTP_URL ?? 'https://polygon-bor-rpc.publicnode.com', funderForV2);
                sigTypeV2 = det.sigType;
                Logger.info(`[ORDER_V2] [${followerId}] sigType auto-detect: ${sigTypeV2} (${det.reason})`);
                if (user.wallet.proxySignatureType !== sigTypeV2 && (sigTypeV2 === 0 || sigTypeV2 === 1 || sigTypeV2 === 2 || sigTypeV2 === 3)) {
                    await persistProxySignatureType(user, sigTypeV2);
                }
            }

            const ethersWallet = new EthersWallet(user.wallet.privateKey);
            const { client: v2Client } = await createV2Client({
                host: ENV.CLOB_HTTP_URL,
                ethersWallet,
                funderAddress: funderForV2,
                sigType: sigTypeV2,
                creds: { key: credsForV2.key, secret: credsForV2.secret, passphrase: credsForV2.passphrase },
            });

            // Pra MARKET BUY: amount em USDC; senao shares
            const sizeForV2 = isMarket && sideStr === 'BUY'
                ? (orderArgs.amount ?? (orderArgs.size && orderArgs.price ? orderArgs.size * orderArgs.price : 0))
                : (orderArgs.size ?? (orderArgs.amount && orderArgs.price ? orderArgs.amount / orderArgs.price : 0));

            if (sizeForV2 <= 0) {
                throw new Error(`size <= 0 (amount=${orderArgs.amount} size=${orderArgs.size} price=${orderArgs.price})`);
            }

            Logger.info(`[ORDER_V2] [${followerId}] sigType=${sigTypeV2} funder=${funderForV2.slice(0,10)}… ${isMarket ? OrderTypeV2.FAK : OrderTypeV2.GTC} ${sideStr} size=${sizeForV2} @ ${orderArgs.price} tickSize=${tickSizeV2}`);

            const resp = await submitOrderV2({
                client: v2Client,
                side: sideStr,
                tokenId: tokenID,
                priceUsd: orderArgs.price,
                size: sizeForV2,
                market: isMarket,
                orderType: isMarket ? OrderTypeV2.FAK : OrderTypeV2.GTC,
                tickSize: tickSizeV2,
                negRisk: detectedNegRisk,
            });

            const elapsedMs = Date.now() - t0;
            if (resp?.success !== false && (resp?.orderID || resp?.orderId)) {
                const oid = resp.orderID || resp.orderId;
                Logger.success(`[ORDER_V2] [${followerId}] ✓ aceita orderID=${oid} status=${resp.status ?? 'submitted'} (${elapsedMs}ms)`);
                return { success: true, orderID: oid };
            }
            const errStr = resp?.errorMsg || resp?.error || JSON.stringify(resp).slice(0, 200);
            Logger.warning(`[ORDER_V2] [${followerId}] rejeitada (${elapsedMs}ms): ${String(errStr).slice(0, 200)}`);
            // NÃO cair pro fallback V1 — V1 dá order_version_mismatch garantido pós-cutover.
            // Erros V2 são reais (saldo, liquidez, etc) e devem ser surface direto.
            return { success: false, error: errStr };
        } catch (e: any) {
            const elapsedMs = Date.now() - t0;
            Logger.warning(`[ORDER_V2] [${followerId}] EXCEPTION (${elapsedMs}ms): ${e?.message ?? e}`);
            return { success: false, error: e?.message ?? String(e) };
        }
    } else {
        Logger.warning(`[ORDER_V2_GATE] [${followerId}] missing prerequisites — skipping V2`);
    }
    // ---------------------------------------------------------------------

    // Build a client with the lib's network-dependent lookups stubbed out,
    // and seeded with the (tickSize, negRisk) we want it to use for THIS order.
    const blindClient = (client: any, negRiskForOrder: boolean) => {
        try {
            client.tickSizes = client.tickSizes || {};
            client.tickSizes[tokenID] = tickSize;
            client.negRisk = client.negRisk || {};
            client.negRisk[tokenID] = negRiskForOrder;
            client.getTickSize = async (_tid: string) => tickSize;
            client.getNegRisk = async (_tid: string) => negRiskForOrder;
            client.getFeeRateBps = async (_tid: string) => 0;
        } catch (_) { /* ignore */ }
    };

    const tryOnce = async (client: any, sigType: 0 | 1 | 2 | 3, negRiskForOrder: boolean, exchangeTag: string) => {
        const args = { ...orderArgs };
        if (proxyAddress && sigType !== 0) {
            args.maker = proxyAddress;
            args.signatureType = sigType;
        }
        blindClient(client, negRiskForOrder);

        // Read the actual exchange address the lib will use right now.
        let activeExchange: string | undefined;
        try {
            const cfg = await import('@polymarket/clob-client/dist/config.js');
            const m: any = (cfg as any).getContractConfig
                ? (cfg as any).getContractConfig(137)
                : (cfg as any).default?.getContractConfig?.(137);
            activeExchange = negRiskForOrder ? m?.negRiskExchange : m?.exchange;
        } catch (_) { /* ignore */ }

        Logger.info(`[ORDER_DEBUG] [${followerId}] tag=${exchangeTag} sigType=${sigType} negRisk=${negRiskForOrder} tickSize=${tickSize} verifyingContract=${activeExchange}`);
        Logger.info(`[PAYLOAD_DEBUG] [${followerId}] userOrder=${JSON.stringify({
            side: args.side, tokenID: String(args.tokenID).slice(0, 18) + '…',
            size: args.size, amount: args.amount, price: args.price, maker: args.maker
        })}`);

        const opts = { tickSize, negRisk: negRiskForOrder };
        const signed = isMarket
            ? await client.createMarketOrder(args, opts as any)
            : await client.createOrder(args, opts as any);
        try {
            const dump = {
                salt: signed.salt,
                maker: signed.maker,
                signer: signed.signer,
                taker: signed.taker,
                tokenId: String(signed.tokenId),
                makerAmount: signed.makerAmount,
                takerAmount: signed.takerAmount,
                expiration: signed.expiration,
                nonce: signed.nonce,
                feeRateBps: signed.feeRateBps,
                side: signed.side,
                signatureType: signed.signatureType,
                signature: signed.signature,  // FULL signature for post-mortem
                _verifyingContract: activeExchange,
                _negRiskExchange: negRiskForOrder
            };
            Logger.info(`[SIGN_DEBUG] [${followerId}] FULL_SIGNED=${JSON.stringify(dump)}`);
        } catch (_) { /* ignore */ }
        const resp = await client.postOrder(signed, isMarket ? OrderType.FOK : OrderType.GTC);
        Logger.info(`[RESPONSE_DEBUG] [${followerId}] postOrder=${JSON.stringify(resp).slice(0, 800)}`);
        return resp;
    };

    // ALIGNED WITH py-clob-client (the canonical Polymarket SDK):
    //   - Only 3 signatureTypes exist: EOA=0, POLY_PROXY=1, POLY_GNOSIS_SAFE=2
    //   - Only 2 exchange addresses on Polygon (std + neg-risk)
    //   - The negRisk flag selects WHICH exchange to use; not a separate dim.
    // The matrix walks (sigType × negRisk) — at most 4 attempts, almost
    // always succeeds on the first.
    type Attempt = { sigType: 0 | 1 | 2; negRisk: boolean; exchange: 'v1' | 'v2' };
    // Coerce: sigType=3 was a misguided experiment; downgrade to 1 (POLY_PROXY).
    const safeInitialSigType: 0 | 1 | 2 =
        initialSigType === 0 || initialSigType === 1 || initialSigType === 2
            ? initialSigType
            : 1;
    const initial: Attempt = { sigType: safeInitialSigType, negRisk: detectedNegRisk, exchange: 'v1' };
    const sigCandidates: (0 | 1 | 2)[] = proxyAddress
        ? [safeInitialSigType, ...([1, 2].filter(t => t !== safeInitialSigType) as (0 | 1 | 2)[])]
        : [0];
    const altSigType: 0 | 1 | 2 = (sigCandidates.find(s => s !== safeInitialSigType) ?? safeInitialSigType) as 0 | 1 | 2;

    const matrix: Attempt[] = [];
    // Try detected negRisk first (it's likely correct).
    for (const s of sigCandidates) matrix.push({ sigType: s, negRisk: detectedNegRisk, exchange: 'v1' });
    // Flip negRisk if all sigTypes failed — maybe the market is actually neg-risk.
    for (const s of sigCandidates) matrix.push({ sigType: s, negRisk: !detectedNegRisk, exchange: 'v1' });

    let lastErr = 'no attempt run';
    for (let m = 0; m < matrix.length; m++) {
        const { sigType, negRisk, exchange } = matrix[m];
        const isFirst = m === 0;
        const tag = `${sigType}/${negRisk ? 'negRisk' : 'std'}/${exchange}`;

        // Switch the lib's hardcoded exchange address for THIS attempt.
        const exAddr = exchange === 'v1' ? KNOWN_EXCHANGES.v1 : KNOWN_EXCHANGES.v2;
        setExchangeAddresses(exAddr, KNOWN_EXCHANGES.negRiskV1);

        let client: any = initialClient;
        if (!isFirst) {
            try {
                client = sigType === initial.sigType
                    ? initialClient
                    : await getClobClientForUserWithSigType(user, sigType, proxyAddress);
                if (!client) { lastErr = 'CLOB client unavailable for sigType=' + sigType; continue; }
            } catch (e: any) {
                lastErr = e?.message || String(e);
                continue;
            }
            Logger.warning(`[ORDER] [${followerId}] Retrying with ${tag} after: "${lastErr.slice(0, 80)}"`);
        } else {
            Logger.info(`[ORDER] [${followerId}] First attempt: ${tag}`);
        }

        // Per-row transient retries (Cloudflare, ECONNRESET, etc.)
        const transientAttempts = isFirst ? 3 : 1;
        let resp: any = null;
        for (let i = 0; i < transientAttempts; i++) {
            try {
                resp = await tryOnce(client, sigType, negRisk, tag);
            } catch (e: any) {
                const errMsg = e?.message || String(e);
                const stk = (e?.stack || '').split('\n').slice(0, 5).join(' | ');
                Logger.error(`[ORDER] [${followerId}] EXCEPTION ${tag} (try ${i + 1}/${transientAttempts}): ${errMsg.slice(0, 240)}`);
                Logger.error(`[ORDER] [${followerId}] STACK: ${stk.slice(0, 600)}`);
                resp = { success: false, error: errMsg };
            }
            if (resp?.success) {
                if (!isFirst) {
                    Logger.success(`[ORDER] [${followerId}] ${tag} succeeded — persisting sigType=${sigType}`);
                    await persistProxySignatureType(user, sigType);
                }
                return resp;
            }
            const err = extractOrderError(resp);
            if (isTransient(err) && i < transientAttempts - 1) {
                await sleep(800 * (i + 1));
                continue;
            }
            break;
        }

        lastErr = extractOrderError(resp);
        Logger.error(`[ORDER] [${followerId}] ${tag} failed: ${lastErr}`);
        // Only walk to the next combo if the error suggests the signing
        // dimensions are wrong (version_mismatch / invalid signature / domain mismatch).
        if (!isVersionMismatch(lastErr)) break;
    }

    // V1 manual fallback removido pós-cutover Polymarket V2 (2026-04-28). O
    // signOrderManually antigo assinava contra exchange V1 (0x4bFb…) com schema
    // V1 (com taker/expiration/nonce/feeRateBps), que sempre retorna
    // order_version_mismatch agora. PATH 0 (orderV2.ts via SDK oficial v2) é
    // o único caminho viável — se ele falhar com signing error, é bug a corrigir
    // no wrapper, não algo a contornar com fallback V1.
    return { success: false, error: lastErr };
};

export const postOrder = async (
    clobClient: any,
    effectiveCondition: 'buy' | 'sell',
    my_position: any,
    user_position: any,
    trade: any,
    my_balance: number,
    followerId: string,
    config: any,
    my_positions: any[],
    proxyAddress?: string,
    retryLimit: number = 3,
    followerUser?: any
) => {
    try {
        const isMirror100 = config.mode === 'MIRROR_100' || config.bypassFilters;
        const sigType: 0 | 1 | 2 | 3 = followerUser?.wallet?.proxySignatureType
            ?? (proxyAddress ? 2 : 0);

        if (effectiveCondition === 'buy') {
            Logger.info(`[${followerId}] [EXECUTION] Mode: ${isMirror100 ? 'MIRROR (No Filters)' : 'NORMAL'} sigType=${sigType}`);

            const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;
            const orderCalc = calculateOrderSize(config, trade.usdcSize, my_balance, currentPositionValue);

            let orderSize = orderCalc.finalAmount;

            // ABSOLUTE BYPASS FOR MIRROR MODE
            if (!isMirror100 && orderSize <= 0) {
                await recordStatus(trade._id, followerId, 'PULADO (ESTRATÉGIA)', orderCalc.reasoning);
                return { success: false, error: orderCalc.reasoning };
            } else if (isMirror100) {
                orderSize = trade.usdcSize;
            }

            const orderBook = await clobClient.getOrderBook(trade.asset);
            const asks = orderBook.asks || [];
            if (asks.length === 0) {
                const err = 'Sem ofertas de venda (asks) no book';
                await recordStatus(trade._id, followerId, 'FALHA (LIQUIDEZ)', err);
                return { success: false, error: err };
            }

            const minPriceAsk = asks.reduce(
                (min: any, ask: any) => (parseFloat(ask.price) < parseFloat(min.price) ? ask : min),
                asks[0]
            );
            const executionPrice = parseFloat(minPriceAsk.price);

            // Decide MARKET vs LIMIT path:
            //  - Polymarket MARKET FOK has a $1 USDC notional minimum
            //    AND many markets reject below 5 tokens.
            //  - LIMIT GTC (createOrder) accepts smaller sizes and
            //    fills instantly when we use the best ask price.
            //  - For tiny orders (<$5) prefer LIMIT to avoid silent rejects.
            const userOrderType = (config?.orderType || 'MARKET').toUpperCase();
            const useMarket = userOrderType === 'MARKET' && orderSize >= 5;

            // CRITICAL: the @polymarket/clob-client lib uses different field
            // names for the two paths:
            //   UserOrder       (createOrder / LIMIT)  → `size`   (in TOKENS)
            //   UserMarketOrder (createMarketOrder)    → `amount` (USDC for BUY)
            // Passing the wrong key makes the lib read `undefined` and crash
            // inside `decimalPlaces(undefined)` → `undefined.toString()`.
            const orderArgs: any = {
                side: Side.BUY,
                tokenID: trade.asset,
                price: executionPrice,
            };
            if (useMarket) {
                orderArgs.amount = orderSize;            // USDC notional
            } else {
                orderArgs.size = orderSize / executionPrice; // TOKEN count
            }

            Logger.info(`[${followerId}] [SENDING] $${orderSize.toFixed(4)} @ ${executionPrice} (${useMarket ? `MARKET-FOK amount=${orderSize}` : `LIMIT-GTC size=${(orderSize / executionPrice).toFixed(4)}`}) to Polymarket...`);
            const resp = await signAndPost(
                clobClient, followerUser, sigType, proxyAddress,
                orderArgs, useMarket, followerId
            );

            if (resp.success) {
                Logger.success(`[${followerId}] [API-RESPONSE] SUCCESS! OrderID: ${resp.orderID}`);
                await User.updateOne({ _id: followerId }, { $inc: { totalSpentUSD: orderSize } });
                telegram.tradeExecuted(followerId, 'BUY', orderSize, executionPrice, trade.slug || trade.title);
                return { success: true, amount: orderSize, price: executionPrice };
            } else {
                Logger.error(`[${followerId}] [API-RESPONSE] REJECTED: ${resp.error}`);
                // Record what we ATTEMPTED so the dashboard shows the planned
                // entry/lucro even when execution failed. The 'attempted' flag
                // tells the UI to render the value with a different style.
                await recordStatus(trade._id, followerId, 'FALHA (EXCHANGE)', resp.error, {
                    attemptedAmount: orderSize,
                    attemptedPrice: executionPrice,
                    attemptedAt: new Date()
                });
                return { success: false, error: resp.error };
            }
        } else if (effectiveCondition === 'sell') {
            if (!my_position) {
                await recordStatus(trade._id, followerId, 'PULADO (SEM POSIÇÃO)', 'Você não possui posição aberta neste mercado para vender.');
                return { success: false, error: 'Sem posição para vender' };
            }

            let trader_sell_percent = 1.0;
            if (user_position && user_position.size > 0 && trade.size) {
                trader_sell_percent = Math.min(1.0, trade.size / user_position.size);
            }
            const sellTokens = my_position.size * trader_sell_percent;

            const orderBook = await clobClient.getOrderBook(trade.asset);
            const bids = orderBook.bids || [];
            if (bids.length === 0) {
                const err = 'Sem ofertas de compra (bids) no book';
                await recordStatus(trade._id, followerId, 'FALHA (LIQUIDEZ)', err);
                return { success: false, error: err };
            }

            const maxPriceBid = bids.reduce(
                (max: any, bid: any) => (parseFloat(bid.price) > parseFloat(max.price) ? bid : max),
                bids[0]
            );
            const sellPrice = parseFloat(maxPriceBid.price);

            // SELL via LIMIT-GTC → uses UserOrder.size (TOKENS), not amount.
            const orderArgs: any = {
                side: Side.SELL,
                tokenID: trade.asset,
                price: sellPrice,
                size: sellTokens
            };

            Logger.info(`[${followerId}] [SENDING] SELL size=${sellTokens.toFixed(4)} tokens @ ${sellPrice} (LIMIT-GTC) to Polymarket...`);
            const resp = await signAndPost(
                clobClient, followerUser, sigType, proxyAddress,
                orderArgs, false /* limit */, followerId
            );

            if (resp.success) {
                Logger.success(`[${followerId}] [API-RESPONSE] SELL SUCCESS! OrderID: ${resp.orderID}`);
                telegram.tradeExecuted(followerId, 'SELL', sellTokens * sellPrice, sellPrice, trade.slug || trade.title);
                return { success: true, amount: sellTokens * sellPrice, price: sellPrice };
            } else {
                Logger.error(`[${followerId}] [API-RESPONSE] SELL REJECTED: ${resp.error}`);
                await recordStatus(trade._id, followerId, 'FALHA (EXCHANGE)', resp.error, {
                    attemptedAmount: sellTokens * sellPrice,
                    attemptedPrice: sellPrice,
                    attemptedAt: new Date()
                });
                return { success: false, error: resp.error };
            }
        }

        return { success: false, error: 'Fluxo incompleto' };
    } catch (error: any) {
        Logger.error(`[${followerId}] [CRITICAL] ${error.message}`);
        return { success: false, error: error.message };
    }
};

export default postOrder;
