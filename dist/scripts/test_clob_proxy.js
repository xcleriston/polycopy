var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ethers } from 'ethers';
import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();
function testClobWithProxy() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        yield mongoose.connect(process.env.MONGODB_URI);
        const u = yield User.findOne({ username: 'copiador' }).lean();
        if (!u || !((_a = u.wallet) === null || _a === void 0 ? void 0 : _a.privateKey))
            return;
        const pk = u.wallet.privateKey;
        const proxy = '0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B'; // From screenshot
        const wallet = new ethers.Wallet(pk);
        const client = new ClobClient('https://clob.polymarket.com/', 137, wallet, undefined, SignatureType.POLY_GNOSIS_SAFE, proxy, proxy);
        console.log(`Testing CLOB Balance for EOA ${wallet.address} with Proxy ${proxy}`);
        try {
            const resp = yield client.getBalanceAllowance({
                asset_type: 'collateral',
                funder: proxy // Explicitly pass funder
            });
            console.log("CLOB Response:", JSON.stringify(resp, null, 2));
        }
        catch (e) {
            console.error("CLOB Error:", e.message);
        }
        yield mongoose.connection.close();
    });
}
testClobWithProxy();
