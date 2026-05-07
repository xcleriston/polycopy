/**
 * Smoke test do pipeline V2 — posta uma ordem REAL minima ($1 USDC) num mercado
 * ativo da Polymarket, usando @polymarket/clob-client-v2 oficial.
 *
 * Uso: configure as env vars e rode:
 *   npx ts-node src/scripts/testOrderV2.ts
 *
 * Env requeridas:
 *   PRIVATE_KEY     — PK da EOA signer (0x + 64 hex)
 *   FUNDER          — address do funder (proxy/safe/depositWallet); se omitido, usa EOA
 *   CLOB_HTTP_URL   — default https://clob.polymarket.com
 *   RPC_HTTP_URL    — default https://polygon-bor-rpc.publicnode.com
 *   GAMMA_HTTP_URL  — default https://gamma-api.polymarket.com
 *
 * Saída esperada se tudo ok:
 *   ✓ orderID: 0x...
 *   ✓ status: matched (ou live se postOnly LIMIT)
 *   ✓ tx hash em polygonscan.com/tx/0x...
 *
 * Critério de sucesso = HTTP 200 + orderID preenchido. Se aparecer erro, consultar
 * a tabela em MIGRATION_V2.md §3.
 */

import { Wallet } from 'ethers';
import axios from 'axios';
import { createV2Client, detectSigType, submitOrderV2, OrderType, SignatureTypeV2 } from '../utils/orderV2.js';

const env = (k: string, def?: string): string => {
    const v = process.env[k] ?? def;
    if (!v) throw new Error(`env ${k} ausente`);
    return v;
};

(async () => {
    const PRIVATE_KEY = env('PRIVATE_KEY');
    const CLOB_HTTP_URL = env('CLOB_HTTP_URL', 'https://clob.polymarket.com');
    const RPC_HTTP_URL = env('RPC_HTTP_URL', 'https://polygon-bor-rpc.publicnode.com');
    const GAMMA_HTTP_URL = env('GAMMA_HTTP_URL', 'https://gamma-api.polymarket.com');

    const wallet = new Wallet(PRIVATE_KEY);
    const eoa = wallet.address;

    // Funder default: tenta /public-profile da Gamma API; se não tiver, usa EOA
    let funder = process.env.FUNDER;
    if (!funder) {
        try {
            const r = await axios.get(`${GAMMA_HTTP_URL}/public-profile?address=${eoa}`);
            if (r.data?.proxyWallet) {
                funder = r.data.proxyWallet;
                console.log(`[smoke] funder auto-detectado via Gamma /public-profile: ${funder}`);
            }
        } catch { /* fall through */ }
    }
    funder ??= eoa;

    // Detect sigType via on-chain probe
    const detection = await detectSigType(RPC_HTTP_URL, funder);
    console.log(`[smoke] eoa=${eoa}`);
    console.log(`[smoke] funder=${funder}`);
    console.log(`[smoke] sigType=${detection.sigType} (${SignatureTypeV2[detection.sigType]}) reason="${detection.reason}"`);

    // Cria ClobClient v2 SEM creds (vai derivar agora). Pra usar creds existentes,
    // passe `creds: { key, secret, passphrase }` em createV2Client.
    const { client } = await createV2Client({
        host: CLOB_HTTP_URL,
        ethersWallet: wallet,
        funderAddress: funder,
        sigType: detection.sigType,
    });

    // Deriva ou recupera API creds (1 chamada Cloudflare; cacheia depois).
    // Workaround: secret vem base64url (com - e _). A propria lib v2 não normaliza
    // antes de atob() em buildPolyHmacSignature → InvalidCharacterError. createV2Client
    // já normaliza ao instanciar.
    const creds = await client.createOrDeriveApiKey();
    console.log(`[smoke] api creds derivadas: ${creds.key.slice(0, 8)}…`);

    // Re-cria client com creds (clob-client-v2 não muta o instance)
    const { client: clientWithCreds } = await createV2Client({
        host: CLOB_HTTP_URL,
        ethersWallet: wallet,
        funderAddress: funder,
        sigType: detection.sigType,
        creds,
    });

    // Pega um mercado ativo via Gamma
    const ms = (await axios.get(`${GAMMA_HTTP_URL}/markets`, {
        params: { active: true, closed: false, limit: 10, order: 'volume24hr', ascending: false },
    })).data;
    const market = ms.find((m: any) => m.enableOrderBook && m.clobTokenIds);
    if (!market) throw new Error('nenhum mercado ativo encontrado');

    const tokenIds = JSON.parse(market.clobTokenIds) as [string, string];
    const tokenId = tokenIds[0];
    const tickSize = (market.minimumTickSize ?? '0.01') as '0.1' | '0.01' | '0.001' | '0.0001';
    const negRisk = !!market.negRisk;

    console.log(`[smoke] mercado: ${(market.question || '').slice(0, 60)}`);
    console.log(`[smoke]   tokenId=${tokenId}, exchange=${negRisk ? 'negRisk' : 'ctf'}, tickSize=${tickSize}`);

    // Order MARKET BUY mínima — $1 USDC (mín da Polymarket)
    const result = await submitOrderV2({
        client: clientWithCreds,
        side: 'BUY',
        tokenId,
        priceUsd: 0.50,
        size: 1.0, // pra MARKET BUY: USDC amount; pra LIMIT: shares
        market: true,
        orderType: OrderType.FAK,
        tickSize,
        negRisk,
    });

    console.log('[smoke] result:', JSON.stringify(result, null, 2));
    if (result?.success === false || !result?.orderID) {
        console.error('[smoke] ✗ ordem rejeitada — consultar MIGRATION_V2.md §3 (tabela de erros)');
        process.exit(1);
    }
    console.log(`[smoke] ✓ ordem aceita: orderID=${result.orderID}, status=${result.status ?? 'submitted'}`);
    if (result.transactionsHashes?.length) {
        for (const tx of result.transactionsHashes) {
            console.log(`[smoke] ✓ tx: https://polygonscan.com/tx/${tx}`);
        }
    }
    process.exit(0);
})().catch((err: any) => {
    console.error('[smoke] FATAL:', err?.message ?? err);
    if (err?.stack) console.error('[smoke] STACK:', err.stack.split('\n').slice(0, 15).join('\n'));
    if (err?.response) {
        console.error('[smoke] HTTP', err.response.status, err.response.data);
    }
    process.exit(1);
});
