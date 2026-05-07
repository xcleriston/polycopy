/**
 * Lista os últimos N trades + activity log com status FALHA pra diagnose.
 */
import connectDB from '../config/db.js';
import { Activity } from '../models/userHistory.js';

(async () => {
    await connectDB();
    const limit = Number(process.argv[2] ?? 10);
    const items = await Activity.find({})
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    console.log(`\n=== Últimas ${limit} activities ===\n`);
    for (const a of items as any[]) {
        const ts = a.timestamp ? new Date(a.timestamp).toISOString().slice(0, 19).replace('T', ' ') : '?';
        const slug = (a.title ?? a.slug ?? '?').slice(0, 50);
        console.log(`${ts} | ${a._id.toString().slice(-6)} | ${slug}`);
        console.log(`  side=${a.side} size=${a.size} price=${a.price} asset=${a.asset?.slice(0,12)}…`);
        if (a.followerStatuses) {
            for (const [fid, fs] of Object.entries<any>(a.followerStatuses)) {
                console.log(`  → ${fid.slice(-6)}: ${fs.status} ${fs.details ? '— ' + String(fs.details).slice(0, 120) : ''}`);
            }
        }
        console.log();
    }
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
