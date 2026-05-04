import connectDB, { closeDB } from './src/config/db.js';
import { Activity } from './src/models/userHistory.js';
async function find() {
    await connectDB();
    const trades = await Activity.find({
        timestamp: {
            $gte: new Date('2026-05-04T20:10:00Z'), // 17:10 BRT is 20:10 UTC
            $lte: new Date('2026-05-04T20:20:00Z')
        }
    }).lean();
    console.log(JSON.stringify(trades, null, 2));
    await closeDB();
}
find();
