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
import { Activity } from '../models/userHistory.js';
import * as dotenv from 'dotenv';
dotenv.config();
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose.connect(process.env.MONGODB_URI);
        // Find activities in the last 30 minutes
        const since = new Date(Date.now() - 30 * 60 * 1000);
        const a = yield Activity.find({ timestamp: { $gt: since } }).sort({ timestamp: -1 }).lean();
        console.log(JSON.stringify(a.map(x => ({ title: x.title, side: x.side, time: x.timestamp, processed: x.processedBy })), null, 2));
        yield mongoose.connection.close();
    });
}
check();
