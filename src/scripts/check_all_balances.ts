import { ethers } from 'ethers';
import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_ABI = ["function balanceOf(address account) view returns (uint256)"];
const USDC_ADDR = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/VDsFz_Ooaj0-4vaVrIxOd';

async function check() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, provider);
    
    const users = await User.find({}).lean();
    for (const u of users) {
        const eoa = (u as any).wallet?.address;
        const proxy = (u as any).wallet?.proxyAddress;
        
        if (eoa) {
            const b = await usdc.balanceOf(eoa);
            console.log(`User ${u.username} EOA ${eoa}: ${ethers.utils.formatUnits(b, 6)}`);
        }
        if (proxy && proxy !== eoa) {
            const b = await usdc.balanceOf(proxy);
            console.log(`User ${u.username} PROXY ${proxy}: ${ethers.utils.formatUnits(b, 6)}`);
        }
    }
    await mongoose.connection.close();
}
check();
