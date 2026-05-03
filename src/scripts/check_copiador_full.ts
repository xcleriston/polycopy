import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkCopiador() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const u = await User.findOne({ username: 'copiador' }).lean();
    
    if (u) {
        console.log(`User: copiador`);
        console.log(`EOA: ${(u as any).wallet?.address}`);
        console.log(`Proxy: ${(u as any).wallet?.proxyAddress || 'NOT SET'}`);
        console.log(`CLOB Creds Present: ${!!(u as any).wallet?.clobCreds?.key}`);
    } else {
        console.log("User 'copiador' not found.");
    }
    
    await mongoose.connection.close();
}

checkCopiador();
