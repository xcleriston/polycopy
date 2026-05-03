import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function findUser() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const u = await User.findOne({ 
        $or: [
            { username: 'appsmmn' }, 
            { email: 'appsmmn@gmail.com' }, 
            { 'wallet.address': { $regex: /0x3075/i } }
        ] 
    }).lean();
    
    if (u) {
        console.log("USER FOUND:");
        console.log(`ID: ${u._id}`);
        console.log(`Username: ${u.username}`);
        console.log(`Email: ${u.email}`);
        console.log(`Wallet Address: ${(u as any).wallet?.address}`);
        console.log(`Proxy Address: ${(u as any).wallet?.proxyAddress}`);
    } else {
        console.log("USER NOT FOUND IN DB");
    }
    
    await mongoose.connection.close();
}

findUser();
