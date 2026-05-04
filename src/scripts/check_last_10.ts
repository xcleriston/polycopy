import mongoose from 'mongoose';
import { Activity } from '../models/userHistory.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const a = await Activity.find().sort({ timestamp: -1 }).limit(10).lean();
    console.log(JSON.stringify(a.map(x => ({ 
        title: x.title, 
        time: x.timestamp, 
        processedBy: (x as any).processedBy, 
        followerStatuses: (x as any).followerStatuses 
    })), null, 2));
    await mongoose.connection.close();
}
check();
