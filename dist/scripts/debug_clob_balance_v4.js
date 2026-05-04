var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ClobClient, AssetType } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ethers } from 'ethers';
import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose.connect(process.env.MONGODB_URI);
        const u = yield User.findOne({ username: 'copiador' }).lean();
        if (!u)
            return;
        const pk = u.wallet.privateKey;
        const creds = u.wallet.clobCreds;
        const proxy = u.wallet.proxyAddress;
        const wallet = new ethers.Wallet(pk);
        const client = new ClobClient('https://clob.polymarket.com/', 137, wallet, creds, SignatureType.POLY_GNOSIS_SAFE, proxy, proxy);
        try {
            const resp = yield client.getBalanceAllowance({
                asset_type: AssetType.COLLATERAL,
                funder: proxy
            });
            console.log("CLOB Response:", JSON.stringify(resp, null, 2));
        }
        catch (e) {
            console.error("CLOB Error:", e.message);
        }
        yield mongoose.connection.close();
    });
}
check();
