import connectDB, { closeDB } from '../config/db.js';
import { Activity } from '../models/userHistory.js';
import User from '../models/user.js';

async function check() {
    await connectDB();
    try {
        console.log('--- USERS ---');
        const users = await User.find({}).lean();
        users.forEach(u => {
            console.log(`User: ${u.username} | ID: ${u._id}`);
            console.log(`  Trader: ${u.config?.traderAddress}`);
            console.log(`  Wallet: ${u.wallet?.address}`);
            console.log(`  Proxy:  ${u.wallet?.proxyAddress}`);
        });

        console.log('\n--- LATEST TRADES ---');
        const trades = await Activity.find({ type: 'TRADE' }).sort({ timestamp: -1 }).limit(10).lean();
        trades.forEach(t => {
            console.log(`Trade: ${t.title} | TX: ${t.transactionHash} | SIDE: ${t.side}`);
            console.log(`  Trader: ${t.traderAddress}`);
            console.log(`  FollowerStatuses: ${JSON.stringify(t.followerStatuses, null, 2)}`);
            console.log(`  ProcessedBy: ${JSON.stringify(t.processedBy)}`);
        });
    } finally {
        await closeDB();
    }
}

check();
