/**
 * Smoke da nova detectProxyType (createClobClient.ts) — confirma que ela
 * agora reconhece sigType=3 (POLY_1271 / DepositWallet) via ERC-5267.
 */
import { detectProxyType } from '../utils/createClobClient.js';

(async () => {
    const cases: Array<{ name: string; addr: string; expect: number }> = [
        { name: 'DepositWallet (roxcopy funder)', addr: '0x5cc87d3702235d4c5c1d1d957cd15327d7a72e36', expect: 3 },
        { name: 'Gnosis Safe (PK 001 funder)',    addr: '0x51b7c68a71dccbc0b7fa4400934a293d8f4d3ba8', expect: 2 },
    ];
    for (const c of cases) {
        const r = await detectProxyType(c.addr);
        const ok = r === c.expect ? '✓' : '✗';
        console.log(`${ok} ${c.name} ${c.addr.slice(0,10)}… → ${r} (esperado ${c.expect})`);
    }
})();
