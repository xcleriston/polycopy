import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkCreds() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("No MONGODB_URI");
        return;
    }

    await mongoose.connect(uri);
    const users = await User.find({}).lean();
    
    console.log(`Found ${users.length} users.`);
    
    users.forEach(user => {
        const creds = (user as any).wallet?.clobCreds;
        console.log(`User: ${user.username || user.email}`);
        console.log(`  - Wallet: ${(user as any).wallet?.address || 'None'}`);
        if (creds) {
            console.log(`  - Creds Present: YES`);
            console.log(`  - Key length: ${creds.key?.length || 0}`);
            console.log(`  - Secret length: ${creds.secret?.length || 0}`);
            console.log(`  - Passphrase length: ${creds.passphrase?.length || 0}`);
            console.log(`  - Derived At: ${creds.derivedAt}`);
        } else {
            console.log(`  - Creds Present: NO`);
        }
    });
    
    await mongoose.connection.close();
}

checkCreds();
