/**
 * Smoke do helper enrichWalletV2 — usa o address derivado da PRIVATE_KEY do .env
 * pra confirmar que: (1) Gamma API responde, (2) detectSigType acerta o tipo.
 */
import { Wallet } from 'ethers';
import { enrichWalletV2 } from '../utils/orderV2.js';

(async () => {
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY ausente');
    const eoa = new Wallet(PRIVATE_KEY).address;
    const rpcUrl = process.env.RPC_HTTP_URL ?? 'https://polygon-bor-rpc.publicnode.com';
    console.log(`[enrich-test] eoa=${eoa}`);
    const r = await enrichWalletV2({ eoa, rpcUrl });
    if (!r) {
        console.log('[enrich-test] sem profile — EOA nunca usou polymarket.com');
        process.exit(0);
    }
    console.log('[enrich-test] ✓', r);
})();
