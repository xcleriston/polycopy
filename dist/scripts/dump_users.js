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
function dumpUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.error("No MONGODB_URI");
            return;
        }
        yield mongoose.connect(uri);
        const users = yield User.find({}).lean();
        console.log(JSON.stringify(users, (key, value) => key === 'password' || key === 'privateKey' || key === 'secret' ? '***' : value, 2));
        yield mongoose.connection.close();
    });
}
dumpUsers();
