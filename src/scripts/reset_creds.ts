import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const userId = "69dfe485f83e34811ecef999";
    console.log(`Resetting CLOB credentials for ${userId}...`);
    const res = await User.updateOne(
        { _id: userId },
        { $unset: { 'wallet.clobCreds': '' } }
    );
    console.log('Reset result:', res);
    await mongoose.connection.close();
}
run();
