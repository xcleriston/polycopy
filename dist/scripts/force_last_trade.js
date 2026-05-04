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
import User from '../models/user.js';
import { postOrder, recordStatus } from '../utils/postOrder.js';
import { getClobClientForUser, findProxyWallet } from '../utils/createClobClient.js';
import getMyBalance from '../utils/getMyBalance.js';
import * as dotenv from 'dotenv';
dotenv.config();
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose.connect(process.env.MONGODB_URI);
        console.log('🚀 [WAR-MODE] Forçando execução direta do último trade...');
        const trade = yield Activity.findOne({
            slug: 'nhl-min-col-2026-05-03',
            side: 'BUY'
        }).sort({ timestamp: -1 });
        if (!trade) {
            console.log('❌ Trade não encontrado.');
            yield mongoose.connection.close();
            return;
        }
        const follower = yield User.findById("69dfe485f83e34811ecef999");
        if (!follower) {
            console.log('❌ Usuário não encontrado.');
            yield mongoose.connection.close();
            return;
        }
        console.log(`🎯 Processando para ${follower.username}...`);
        const clobClient = yield getClobClientForUser(follower);
        const proxyAddr = yield findProxyWallet(follower);
        const my_balance = yield getMyBalance(clobClient);
        const result = yield postOrder(clobClient, 'buy', null, // No position for this test
        null, // No user position for this test
        trade, my_balance, follower._id.toString(), follower.config, [], proxyAddr);
        if (result.success) {
            console.log('✅ SUCESSO REAL! Gravando no banco...');
            yield recordStatus(trade._id, follower._id.toString(), 'SUCESSO', 'Forçado manualmente via TaskForce', {
                processed: true,
                myEntryAmount: result.amount,
                myEntryPrice: result.price,
                myExecutedAt: new Date()
            });
        }
        else {
            console.log(`❌ FALHA REAL: ${result.error}`);
        }
        yield mongoose.connection.close();
    });
}
run();
