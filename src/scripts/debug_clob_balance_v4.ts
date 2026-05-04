import { ClobClient, AssetType } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ethers } from 'ethers';
import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const u = await User.findOne({ username: 'copiador' }).lean();
    if (!u) return;

    const pk = (u as any).wallet.privateKey;
    const creds = (u as any).wallet.clobCreds;
    const proxy = (u as any).wallet.proxyAddress;
    
    const wallet = new ethers.Wallet(pk);
    const client = new ClobClient(
        'https://clob.polymarket.com/',
        137,
        wallet,
        creds,
        SignatureType.POLY_GNOSIS_SAFE,
        proxy,
        proxy
    );
    
    try {
        const resp = await client.getBalanceAllowance({
            asset_type: AssetType.COLLATERAL,
            funder: proxy
        } as any);
        console.log("CLOB Response:", JSON.stringify(resp, null, 2));
    } catch (e: any) {
        console.error("CLOB Error:", e.message);
    }
    
    await mongoose.connection.close();
}
check();
