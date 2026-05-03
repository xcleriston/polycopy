import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function fixCopiador() {
    await mongoose.connect(process.env.MONGODB_URI!);
    
    const eoa = '0xC25C4CECd118E1F90b8D7fb41f19e1E9ef687FF3';
    const proxy = '0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B';
    
    const result = await User.findOneAndUpdate(
        { 'wallet.address': eoa },
        { $set: { 'wallet.proxyAddress': proxy } },
        { new: true }
    );
    
    if (result) {
        console.log(`✅ Success! User ${result.username} updated.`);
        console.log(`EOA: ${result.wallet.address}`);
        console.log(`Proxy: ${result.wallet.proxyAddress}`);
    } else {
        console.log("❌ User not found with EOA " + eoa);
    }
    
    await mongoose.connection.close();
}

fixCopiador();
