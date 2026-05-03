import mongoose from 'mongoose';
import User from '../models/user.js';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function deepAudit() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const users = await User.find({}).lean();
    
    console.log(`Deep audit of ${users.length} users...`);
    
    for (const u of users) {
        const pk = (u as any).wallet?.privateKey;
        const storedAddr = (u as any).wallet?.address;
        
        if (pk) {
            try {
                const wallet = new ethers.Wallet(pk);
                const derivedAddr = wallet.address;
                console.log(`User: ${(u as any).username || (u as any).email || 'NoName'}`);
                console.log(`  - PK found`);
                console.log(`  - Stored Addr: ${storedAddr}`);
                console.log(`  - Derived Addr: ${derivedAddr}`);
                
                if (storedAddr !== derivedAddr) {
                    console.log(`  ⚠️ MISMATCH detected for this user!`);
                }
                
                if (derivedAddr.toLowerCase() === '0x3075a90F9bdAC075EBb018b074a69E7f5B98D8D6'.toLowerCase()) {
                    console.log(`  🎯 TARGET ADDRESS FOUND! This is the user's account.`);
                }
            } catch (e) {
                console.log(`  ❌ Invalid PK for user ${(u as any).username}`);
            }
        }
    }
    
    await mongoose.connection.close();
}

deepAudit();
