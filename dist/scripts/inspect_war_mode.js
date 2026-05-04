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
        // Pegando o trade de 23:34:24 (02:34:24 UTC)
        const a = yield Activity.findOne({
            timestamp: { $gt: new Date('2026-05-04T02:34:00.000Z') },
            slug: 'nhl-min-col-2026-05-03'
        }).lean();
        console.log('--- TRADE DATA ---');
        console.log(JSON.stringify(a, null, 2));
        yield mongoose.connection.close();
    });
}
check();
