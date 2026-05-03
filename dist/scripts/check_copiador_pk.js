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
function checkDerivation() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        yield mongoose.connect(process.env.MONGODB_URI);
        const u = yield User.findOne({ username: 'copiador' }).lean();
        if (u && ((_a = u.wallet) === null || _a === void 0 ? void 0 : _a.privateKey)) {
            const pk = u.wallet.privateKey;
            const wallet = new ethers.Wallet(pk);
            console.log(`User: copiador`);
            console.log(`DB Stored Address: ${u.wallet.address}`);
            console.log(`Derived Address: ${wallet.address}`);
            if (wallet.address.toLowerCase() === '0x3075a90F9bdAC075EBb018b074a69E7f5B98D8D6'.toLowerCase()) {
                console.log("MATCH! The stored address is just stale.");
            }
            else {
                console.log("MISMATCH! The private key in DB belongs to a different wallet.");
            }
        }
        else {
            console.log("User 'copiador' or its PK not found.");
        }
        yield mongoose.connection.close();
    });
}
checkDerivation();
