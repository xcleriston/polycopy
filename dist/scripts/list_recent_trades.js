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
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose.connect(process.env.MONGODB_URI);
        console.log('--- ÚLTIMOS TRADES DETECTADOS ---');
        const trades = yield Activity.find({ type: 'TRADE' }).sort({ timestamp: -1 }).limit(10);
        trades.forEach(t => {
            console.log(`[${t.timestamp.toISOString()}] ID: ${t._id} | Title: ${t.title} | Slug: ${t.slug}`);
        });
        yield mongoose.connection.close();
    });
}
run();
