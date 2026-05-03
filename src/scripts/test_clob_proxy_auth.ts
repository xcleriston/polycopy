import { ClobClient, AssetType } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ethers } from 'ethers';
import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function testClobWithProxy() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const u = await User.findOne({ username: 'copiador' }).lean();
    
    if (!u || !(u as any).wallet?.privateKey || !(u as any).wallet?.clobCreds) {
        console.log("Missing data for user copiador");
        return;
    }
    
    const pk = (u as any).wallet.privateKey;
    const creds = (u as any).wallet.clobCreds;
    const proxy = '0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B'; // From screenshot
    
    const wallet = new ethers.Wallet(pk);
    const client = new ClobClient(
        'https://clob.polymarket.com/',
        137,
        wallet,
        creds, // PASS STORED CREDS
        SignatureType.POLY_GNOSIS_SAFE,
        proxy,
        proxy
    );
    
    console.log(`Testing AUTHENTICATED CLOB Balance for EOA ${wallet.address} with Proxy ${proxy}`);
    
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

testClobWithProxy();
