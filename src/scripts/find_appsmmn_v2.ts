import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function findUser() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const users = await User.find({}).lean();
    
    console.log(`Searching through ${users.length} users...`);
    
    for (const u of users) {
        const username = (u as any).username || '';
        const email = (u as any).email || '';
        const address = (u as any).wallet?.address || '';
        
        if (username.includes('apps') || email.includes('apps') || address.toLowerCase().includes('3075')) {
            console.log("MATCH FOUND:");
            console.log(`ID: ${u._id}`);
            console.log(`Username: ${username}`);
            console.log(`Email: ${email}`);
            console.log(`Wallet Address: ${address}`);
            console.log(`Proxy Address: ${(u as any).wallet?.proxyAddress}`);
        }
    }
    
    await mongoose.connection.close();
}

findUser();
