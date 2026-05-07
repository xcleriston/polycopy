/**
 * DRY-RUN do pipeline V2 — exercita TUDO menos o POST final:
 *   1. detectSigType() do funder via on-chain probe (RPC read)
 *   2. createV2Client() — instancia ClobClient v2 com signer ethers
 *   3. createMarketOrder() — monta SignedOrderV2 (faz signing EIP-712 / ERC-7739)
 *   4. Imprime o envelope que SERIA enviado
 *
 * Não posta nada na CLOB. Não gasta dinheiro. Apenas valida que:
 *   - Lib v2 carrega sem erro
 *   - Wallet ethers compatível com ClobSigner
 *   - sigType detection funciona
 *   - Schema V2 (11 campos) é construído corretamente
 *   - Signature é gerada (validar no local: tamanho 65b para sig 0|1|2; composite p/ sig 3)
 *
 * Uso:
 *   PRIVATE_KEY=0x… FUNDER=0x… npm run dry-run-order-v2
 */

import { Wallet } from 'ethers';
import axios from 'axios';
import { createV2Client, detectSigType, OrderType, Side, SignatureTypeV2 } from '../utils/orderV2.js';

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

    console.log(`[dry] eoa=${eoa}`);

    // funder via override OU via Gamma /public-profile OU = EOA
    let funder = process.env.FUNDER;
    if (!funder) {
        try {
            const r = await axios.get(`${GAMMA_HTTP_URL}/public-profile?address=${eoa}`);
            if (r.data?.proxyWallet) {
                funder = r.data.proxyWallet;
                console.log(`[dry] funder via Gamma /public-profile: ${funder} (user="${r.data.name ?? r.data.pseudonym}")`);
            }
        } catch { /* ok */ }
    }
    funder ??= eoa;
    console.log(`[dry] funder=${funder}`);

    // sigType detection
    const det = await detectSigType(RPC_HTTP_URL, funder);
    console.log(`[dry] sigType detect: ${det.sigType} (${SignatureTypeV2[det.sigType]}) deployed=${det.deployed} reason="${det.reason}"`);

    // Client SEM creds (não vamos postar)
    const { client } = await createV2Client({
        host: CLOB_HTTP_URL,
        ethersWallet: wallet,
        funderAddress: funder,
        sigType: det.sigType,
    });
    console.log(`[dry] ClobClient v2 instanciada — host=${CLOB_HTTP_URL}`);

    // Pegar mercado ativo via Gamma
    const ms = (await axios.get(`${GAMMA_HTTP_URL}/markets`, {
        params: { active: true, closed: false, limit: 10, order: 'volume24hr', ascending: false },
    })).data;
    const market = ms.find((m: any) => m.enableOrderBook && m.clobTokenIds);
    if (!market) throw new Error('nenhum mercado ativo encontrado');

    const tokenIds = JSON.parse(market.clobTokenIds) as [string, string];
    const tokenId = tokenIds[0];
    const tickSize = (market.minimumTickSize ?? '0.01') as '0.1' | '0.01' | '0.001' | '0.0001';
    const negRisk = !!market.negRisk;
    console.log(`[dry] mercado: ${(market.question || '').slice(0, 70)}`);
    console.log(`[dry]   tokenId=${tokenId.slice(0, 16)}… exchange=${negRisk ? 'negRisk' : 'ctf'} tickSize=${tickSize}`);

    // Construir + assinar (NÃO postar) — usa createMarketOrder direto da lib
    const userMarketOrder = {
        tokenID: tokenId,
        price: 0.50,
        amount: 1.0,
        side: Side.BUY,
    } as any;
    const opts = { tickSize, negRisk };

    console.log(`[dry] chamando createMarketOrder (sign-only)...`);
    const signed: any = await client.createMarketOrder(userMarketOrder, opts);

    console.log(`[dry] ✓ SignedOrderV2 montada com sucesso:`);
    const sigPreview = signed.signature
        ? `${signed.signature.slice(0, 22)}…${signed.signature.slice(-12)} (${(signed.signature.length - 2) / 2}B)`
        : '<missing>';
    const fields = {
        salt: String(signed.salt),
        maker: signed.maker,
        signer: signed.signer,
        tokenId: String(signed.tokenId).slice(0, 22) + '…',
        makerAmount: signed.makerAmount,
        takerAmount: signed.takerAmount,
        side: signed.side,
        signatureType: signed.signatureType,
        timestamp: signed.timestamp,
        metadata: signed.metadata,
        builder: signed.builder,
        signature: sigPreview,
    };
    console.log(JSON.stringify(fields, null, 2));

    // Análise da signature
    const sigBytes = signed.signature ? (signed.signature.length - 2) / 2 : 0;
    if (det.sigType === SignatureTypeV2.POLY_1271) {
        console.log(`[dry] signature ${sigBytes}B — esperado >= 130B (composite ERC-7739)`);
        if (sigBytes < 130) console.warn(`[dry] ⚠ signature muito curta pra ERC-7739 — possível bug`);
        else console.log(`[dry] ✓ signature size compatible com ERC-7739`);
    } else {
        console.log(`[dry] signature ${sigBytes}B — esperado 65B (ECDSA plain)`);
        if (sigBytes !== 65) console.warn(`[dry] ⚠ signature size inesperado pra sigType=${det.sigType}`);
        else console.log(`[dry] ✓ signature size compatible com EIP-712 plain ECDSA`);
    }

    console.log(`[dry] ====================`);
    console.log(`[dry] PIPELINE V2 OK — schema construído + signature gerada localmente.`);
    console.log(`[dry] Próximo passo: rodar 'npm run test-order-v2' (com PK + funder com saldo) p/ post real.`);
    process.exit(0);
})().catch((err: any) => {
    console.error('[dry] FATAL:', err?.message ?? err);
    if (err?.stack) console.error(err.stack.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
});
