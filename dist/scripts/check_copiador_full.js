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
function checkCopiador() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        yield mongoose.connect(process.env.MONGODB_URI);
        const u = yield User.findOne({ username: 'copiador' }).lean();
        if (u) {
            console.log(`User: copiador`);
            console.log(`EOA: ${(_a = u.wallet) === null || _a === void 0 ? void 0 : _a.address}`);
            console.log(`Proxy: ${((_b = u.wallet) === null || _b === void 0 ? void 0 : _b.proxyAddress) || 'NOT SET'}`);
            console.log(`CLOB Creds Present: ${!!((_d = (_c = u.wallet) === null || _c === void 0 ? void 0 : _c.clobCreds) === null || _d === void 0 ? void 0 : _d.key)}`);
        }
        else {
            console.log("User 'copiador' not found.");
        }
        yield mongoose.connection.close();
    });
}
checkCopiador();
