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
import { User } from '../models/user.js';
import { Activity } from '../models/userHistory.js';
import { createClobClient } from '../utils/createClobClient.js';
import { postOrder } from '../utils/postOrder.js';
import { updateActivityStatus } from '../utils/activityLog.js';
import * as dotenv from 'dotenv';
dotenv.config();
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose.connect(process.env.MONGODB_URI);
        console.log('🚀 [WAR-MODE] Forçando execução direta do último trade...');
        const activity = yield Activity.findOne({ type: 'TRADE' }).sort({ timestamp: -1 });
        if (!activity) {
            console.log('❌ Nenhum trade encontrado.');
            process.exit(1);
        }
        const user = yield User.findOne({ traderAddress: '0x30756778f6579308D639a04620A865bC4782A979' });
        if (!user) {
            console.log('❌ Usuário Ivan Xavier não encontrado.');
            process.exit(1);
        }
        console.log(`🎯 Processando para Ivan Xavier...`);
        const clobClient = yield createClobClient(user);
        if (!clobClient) {
            console.log('❌ Falha ao criar ClobClient.');
            process.exit(1);
        }
        const result = yield postOrder(clobClient, user, {
            tokenId: activity.slug, // Usando slug como fallback se o tokenId não estiver no meta
            price: activity.entryPrice || 0.5,
            side: activity.side,
            size: 1, // Tamanho fixo para teste
            isMirror: true,
            activityId: activity._id ? activity._id.toString() : undefined,
        });
        if (result.success) {
            console.log(`✅ SUCESSO REAL! OrderID: ${result.orderId}`);
            yield updateActivityStatus(activity._id ? activity._id.toString() : '', "SUCESSO", `Forçado manualmente via TaskForce`);
        }
        else {
            console.log(`❌ FALHA: ${result.error}`);
        }
        yield mongoose.connection.close();
    });
}
run().catch(console.error);
