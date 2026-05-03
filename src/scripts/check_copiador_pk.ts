import mongoose from 'mongoose';
import User from '../models/user.js';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkDerivation() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const u = await User.findOne({ username: 'copiador' }).lean();
    
    if (u && (u as any).wallet?.privateKey) {
        const pk = (u as any).wallet.privateKey;
        const wallet = new ethers.Wallet(pk);
        console.log(`User: copiador`);
        console.log(`DB Stored Address: ${(u as any).wallet.address}`);
        console.log(`Derived Address: ${wallet.address}`);
        
        if (wallet.address.toLowerCase() === '0x3075a90F9bdAC075EBb018b074a69E7f5B98D8D6'.toLowerCase()) {
            console.log("MATCH! The stored address is just stale.");
        } else {
            console.log("MISMATCH! The private key in DB belongs to a different wallet.");
        }
    } else {
        console.log("User 'copiador' or its PK not found.");
    }
    
    await mongoose.connection.close();
}

checkDerivation();
