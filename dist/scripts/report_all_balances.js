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
import getMyBalance from '../utils/getMyBalance.js';
import { getClobClientForUser } from '../utils/createClobClient.js';
import * as dotenv from 'dotenv';
dotenv.config();
function checkAllUserBalances() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.error("No MONGODB_URI");
            return;
        }
        yield mongoose.connect(uri);
        const users = yield User.find({}).lean();
        console.log(`\n=== RELATÓRIO DE SALDOS POR USUÁRIO ===\n`);
        for (const user of users) {
            const username = user.username || user.email || 'Sem Nome';
            const eoa = (_a = user.wallet) === null || _a === void 0 ? void 0 : _a.address;
            const proxy = (_b = user.wallet) === null || _b === void 0 ? void 0 : _b.proxyAddress;
            console.log(`👤 Usuário: ${username}`);
            if (eoa) {
                const balEoa = yield getMyBalance(eoa);
                console.log(`   🔸 EOA (${eoa.slice(0, 10)}...): $${balEoa.toFixed(2)}`);
            }
            else {
                console.log(`   🔸 EOA: Não configurada`);
            }
            if (proxy && proxy !== eoa) {
                const balProxy = yield getMyBalance(proxy);
                console.log(`   🔹 Proxy/Gnosis (${proxy.slice(0, 10)}...): $${balProxy.toFixed(2)}`);
            }
            else if (proxy === eoa) {
                console.log(`   🔹 Proxy: Mesma da EOA`);
            }
            else {
                console.log(`   🔹 Proxy: Não detectada`);
            }
            // Try CLOB Balance if creds are present
            if ((_d = (_c = user.wallet) === null || _c === void 0 ? void 0 : _c.clobCreds) === null || _d === void 0 ? void 0 : _d.key) {
                try {
                    const clobClient = yield getClobClientForUser(user);
                    if (clobClient) {
                        const balClob = yield getMyBalance(clobClient);
                        console.log(`   🟢 API CLOB (Funder Check): $${balClob.toFixed(2)}`);
                    }
                }
                catch (e) {
                    console.log(`   🔴 API CLOB: Erro ao consultar`);
                }
            }
            console.log(`----------------------------------------`);
        }
        yield mongoose.connection.close();
    });
}
checkAllUserBalances();
