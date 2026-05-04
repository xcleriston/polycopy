import mongoose from 'mongoose';
import { Activity } from '../models/userHistory.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const a = await Activity.find({ title: /Mirassol/ }).sort({ timestamp: -1 }).limit(1).lean();
    console.log(JSON.stringify(a, null, 2));
    await mongoose.connection.close();
}
check();
