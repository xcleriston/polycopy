import mongoose from 'mongoose';
import { Activity } from '../models/userHistory.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI!);
    // Find activities in the last 30 minutes
    const since = new Date(Date.now() - 30 * 60 * 1000);
    const a = await Activity.find({ timestamp: { $gt: since } }).sort({ timestamp: -1 }).lean();
    console.log(JSON.stringify(a.map(x => ({ title: x.title, side: (x as any).side, time: x.timestamp, processed: (x as any).processedBy })), null, 2));
    await mongoose.connection.close();
}
check();
