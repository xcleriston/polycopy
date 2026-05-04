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
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose.connect(process.env.MONGODB_URI);
        const userId = "69dfe485f83e34811ecef999";
        console.log(`Resetting CLOB credentials for ${userId}...`);
        const res = yield User.updateOne({ _id: userId }, { $unset: { 'wallet.clobCreds': '' } });
        console.log('Reset result:', res);
        yield mongoose.connection.close();
    });
}
run();
