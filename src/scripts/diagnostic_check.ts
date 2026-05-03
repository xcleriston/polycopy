import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkUsers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        const users = await User.find({});
        console.log('Found ' + users.length + ' users');
        users.forEach(u => {
            console.log(`User: ${u.username}`);
            console.log(`  Address: ${u.wallet?.address}`);
            console.log(`  Trader: ${u.config.traderAddress}`);
        });
    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
}

checkUsers();
