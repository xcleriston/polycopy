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
import * as dotenv from 'dotenv';
dotenv.config();
function findUser() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        yield mongoose.connect(process.env.MONGODB_URI);
        const users = yield User.find({}).lean();
        console.log(`Searching through ${users.length} users...`);
        for (const u of users) {
            const username = u.username || '';
            const email = u.email || '';
            const address = ((_a = u.wallet) === null || _a === void 0 ? void 0 : _a.address) || '';
            if (username.includes('apps') || email.includes('apps') || address.toLowerCase().includes('3075')) {
                console.log("MATCH FOUND:");
                console.log(`ID: ${u._id}`);
                console.log(`Username: ${username}`);
                console.log(`Email: ${email}`);
                console.log(`Wallet Address: ${address}`);
                console.log(`Proxy Address: ${(_b = u.wallet) === null || _b === void 0 ? void 0 : _b.proxyAddress}`);
            }
        }
        yield mongoose.connection.close();
    });
}
findUser();
