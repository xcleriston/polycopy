import mongoose from 'mongoose';
import { Activity } from '../models/userHistory.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkRecent() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const recent = await Activity.find({ type: 'TRADE' })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean();
    
    console.log("Recent Trades Detected:");
    recent.forEach(t => {
        console.log(`[${new Date(t.timestamp).toLocaleString()}] Trader: ${t.traderAddress} | Market: ${t.title || t.slug}`);
    });
    
    await mongoose.connection.close();
}
checkRecent();
