import connectDB, { closeDB } from './src/config/db.js';
import { Activity } from './src/models/userHistory.js';
async function find() {
    await connectDB();
    const userId = '69dfe485f83e34811ecef999';
    const trades = await Activity.find({
        timestamp: {
            $gte: new Date('2026-05-04T20:10:00Z'),
            $lte: new Date('2026-05-04T20:20:00Z')
        }
    }).lean();
    for (const t of trades) {
        console.log(`Trade: ${t.side} | Time: ${t.timestamp}`);
        console.log(`FollowerStatuses: ${JSON.stringify(t.followerStatuses || {}, null, 2)}`);
        console.log(`ProcessedBy: ${JSON.stringify(t.processedBy || [])}`);
        console.log('---');
    }
    await closeDB();
}
find();
