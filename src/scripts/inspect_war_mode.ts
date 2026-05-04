import mongoose from 'mongoose';
import { Activity } from '../models/userHistory.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI!);
    // Pegando o trade de 23:34:24 (02:34:24 UTC)
    const a = await Activity.findOne({ 
        timestamp: { $gt: new Date('2026-05-04T02:34:00.000Z') },
        slug: 'nhl-min-col-2026-05-03'
    }).lean();
    console.log('--- TRADE DATA ---');
    console.log(JSON.stringify(a, null, 2));
    await mongoose.connection.close();
}
check();
