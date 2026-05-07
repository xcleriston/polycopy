/**
 * Re-detecta `proxySignatureType` de TODOS os users em DB usando o critério
 * V2 (lê eip712Domain via ERC-5267). Polymarket migrou pra V2 em 2026-04-28
 * — Deposit Wallets agora exigem sigType=3 (POLY_1271, ERC-7739 nested sig).
 *
 * Users criados antes do cutover provavelmente têm sigType cacheado errado
 * (geralmente 2 stale onde deveria ser 3, OU 1 onde deveria ser 3). Este
 * script corrige in-place.
 *
 * Uso:
 *   npx ts-node src/scripts/migrateUsersSigTypeV2.ts            # dry-run (mostra mudanças, não persiste)
 *   npx ts-node src/scripts/migrateUsersSigTypeV2.ts --apply    # persiste
 *
 * Env: MONGODB_URI, RPC_HTTP_URL.
 */

import connectDB from '../config/db.js';
import User from '../models/user.js';
import { detectSigType, SignatureTypeV2 } from '../utils/orderV2.js';
import Logger from '../utils/logger.js';

const apply = process.argv.includes('--apply');

(async () => {
    await connectDB();
    const rpc = process.env.RPC_HTTP_URL ?? 'https://polygon-bor-rpc.publicnode.com';

    const users = await User.find({ 'wallet.address': { $exists: true, $ne: null } }).exec();
    Logger.info(`[migrate] checking ${users.length} users (mode=${apply ? 'APPLY' : 'DRY-RUN'})`);

    let changed = 0;
    let same = 0;
    let skipped = 0;

    for (const u of users) {
        const proxy = u.wallet?.proxyAddress ?? u.wallet?.address;
        if (!proxy) { skipped++; continue; }
        const current = u.wallet?.proxySignatureType;
        try {
            const det = await detectSigType(rpc, proxy);
            const newSig = det.sigType;
            if (current === newSig) {
                same++;
                continue;
            }
            Logger.info(`[migrate] ${u._id} proxy=${proxy.slice(0,10)}…  sigType ${current ?? 'none'} → ${newSig} (${SignatureTypeV2[newSig]}) — ${det.reason}`);
            if (apply) {
                u.wallet!.proxySignatureType = newSig as 0 | 1 | 2 | 3;
                await u.save();
            }
            changed++;
        } catch (e: any) {
            Logger.warning(`[migrate] ${u._id} proxy=${proxy.slice(0,10)}… ERROR: ${e?.message ?? e}`);
            skipped++;
        }
    }

    Logger.info(`[migrate] done — same=${same} changed=${changed} skipped=${skipped} (mode=${apply ? 'APPLY' : 'DRY-RUN'})`);
    if (!apply && changed > 0) {
        Logger.info(`[migrate] re-run with --apply pra persistir as mudanças`);
    }
    process.exit(0);
})().catch((err: any) => {
    console.error('[migrate] FATAL:', err);
    process.exit(1);
});
