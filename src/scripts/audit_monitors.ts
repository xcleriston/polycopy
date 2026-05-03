import mongoose from 'mongoose';
import User from '../models/user.js';
import { Activity } from '../models/userHistory.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const users = await User.find({ 'config.enabled': true }).lean();
    console.log(`Found ${users.length} enabled users.`);
    
    for (const u of users) {
        const trader = u.config?.traderAddress;
        if (!trader) continue;
        
        const lastActivity = await Activity.findOne({ traderAddress: trader.toLowerCase() })
            .sort({ timestamp: -1 })
            .lean();
        
        console.log(`User: ${u.username} | Monitoring: ${trader}`);
        if (lastActivity) {
            console.log(`   Latest Activity: ${new Date(lastActivity.timestamp).toLocaleString()} | Market: ${lastActivity.title || lastActivity.slug}`);
        } else {
            console.log(`   No activity detected yet.`);
        }
    }
    
    await mongoose.connection.close();
}
check();
