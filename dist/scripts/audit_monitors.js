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
import { Activity } from '../models/userHistory.js';
import * as dotenv from 'dotenv';
dotenv.config();
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        yield mongoose.connect(process.env.MONGODB_URI);
        const users = yield User.find({ 'config.enabled': true }).lean();
        console.log(`Found ${users.length} enabled users.`);
        for (const u of users) {
            const trader = (_a = u.config) === null || _a === void 0 ? void 0 : _a.traderAddress;
            if (!trader)
                continue;
            const lastActivity = yield Activity.findOne({ traderAddress: trader.toLowerCase() })
                .sort({ timestamp: -1 })
                .lean();
            console.log(`User: ${u.username} | Monitoring: ${trader}`);
            if (lastActivity) {
                console.log(`   Latest Activity: ${new Date(lastActivity.timestamp).toLocaleString()} | Market: ${lastActivity.title || lastActivity.slug}`);
            }
            else {
                console.log(`   No activity detected yet.`);
            }
        }
        yield mongoose.connection.close();
    });
}
check();
