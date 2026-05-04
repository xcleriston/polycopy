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
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose.connect(process.env.MONGODB_URI);
        const u = yield User.find({}).lean();
        console.log(JSON.stringify(u.map(x => { var _a, _b; return ({ username: x.username, eoa: (_a = x.wallet) === null || _a === void 0 ? void 0 : _a.address, proxy: (_b = x.wallet) === null || _b === void 0 ? void 0 : _b.proxyAddress }); }), null, 2));
        yield mongoose.connection.close();
    });
}
check();
