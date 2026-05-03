var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import mongoose from 'mongoose';
import User from '../models/user.js';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();
function deepAudit() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        yield mongoose.connect(process.env.MONGODB_URI);
        const users = yield User.find({}).lean();
        console.log(`Deep audit of ${users.length} users...`);
        for (const u of users) {
            const pk = (_a = u.wallet) === null || _a === void 0 ? void 0 : _a.privateKey;
            const storedAddr = (_b = u.wallet) === null || _b === void 0 ? void 0 : _b.address;
            if (pk) {
                try {
                    const wallet = new ethers.Wallet(pk);
                    const derivedAddr = wallet.address;
                    console.log(`User: ${u.username || u.email || 'NoName'}`);
                    console.log(`  - PK found`);
                    console.log(`  - Stored Addr: ${storedAddr}`);
                    console.log(`  - Derived Addr: ${derivedAddr}`);
                    if (storedAddr !== derivedAddr) {
                        console.log(`  ⚠️ MISMATCH detected for this user!`);
                    }
                    if (derivedAddr.toLowerCase() === '0x3075a90F9bdAC075EBb018b074a69E7f5B98D8D6'.toLowerCase()) {
                        console.log(`  🎯 TARGET ADDRESS FOUND! This is the user's account.`);
                    }
                }
                catch (e) {
                    console.log(`  ❌ Invalid PK for user ${u.username}`);
                }
            }
        }
        yield mongoose.connection.close();
    });
}
deepAudit();
