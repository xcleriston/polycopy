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
function checkCreds() {
    return __awaiter(this, void 0, void 0, function* () {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.error("No MONGODB_URI");
            return;
        }
        yield mongoose.connect(uri);
        const users = yield User.find({}).lean();
        console.log(`Found ${users.length} users.`);
        users.forEach(user => {
            var _a, _b, _c, _d, _e;
            const creds = (_a = user.wallet) === null || _a === void 0 ? void 0 : _a.clobCreds;
            console.log(`User: ${user.username || user.email}`);
            console.log(`  - Wallet: ${((_b = user.wallet) === null || _b === void 0 ? void 0 : _b.address) || 'None'}`);
            if (creds) {
                console.log(`  - Creds Present: YES`);
                console.log(`  - Key length: ${((_c = creds.key) === null || _c === void 0 ? void 0 : _c.length) || 0}`);
                console.log(`  - Secret length: ${((_d = creds.secret) === null || _d === void 0 ? void 0 : _d.length) || 0}`);
                console.log(`  - Passphrase length: ${((_e = creds.passphrase) === null || _e === void 0 ? void 0 : _e.length) || 0}`);
                console.log(`  - Derived At: ${creds.derivedAt}`);
            }
            else {
                console.log(`  - Creds Present: NO`);
            }
        });
        yield mongoose.connection.close();
    });
}
checkCreds();
