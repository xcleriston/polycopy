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
function checkUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield mongoose.connect(process.env.MONGODB_URI);
            const users = yield User.find({});
            console.log('Found ' + users.length + ' users');
            users.forEach(u => {
                var _a;
                console.log(`User: ${u.username}`);
                console.log(`  Address: ${(_a = u.wallet) === null || _a === void 0 ? void 0 : _a.address}`);
                console.log(`  Trader: ${u.config.traderAddress}`);
            });
        }
        catch (error) {
            console.error(error);
        }
        finally {
            yield mongoose.disconnect();
        }
    });
}
checkUsers();
