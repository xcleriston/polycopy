import mongoose from 'mongoose';
import User from '../models/user.js';
import getMyBalance from '../utils/getMyBalance.js';
import { getClobClientForUser } from '../utils/createClobClient.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkAllUserBalances() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("No MONGODB_URI");
        return;
    }

    await mongoose.connect(uri);
    const users = await User.find({}).lean();
    
    console.log(`\n=== RELATÓRIO DE SALDOS POR USUÁRIO ===\n`);
    
    for (const user of users) {
        const username = user.username || user.email || 'Sem Nome';
        const eoa = (user as any).wallet?.address;
        const proxy = (user as any).wallet?.proxyAddress;
        
        console.log(`👤 Usuário: ${username}`);
        
        if (eoa) {
            const balEoa = await getMyBalance(eoa);
            console.log(`   🔸 EOA (${eoa.slice(0,10)}...): $${balEoa.toFixed(2)}`);
        } else {
            console.log(`   🔸 EOA: Não configurada`);
        }

        if (proxy && proxy !== eoa) {
            const balProxy = await getMyBalance(proxy);
            console.log(`   🔹 Proxy/Gnosis (${proxy.slice(0,10)}...): $${balProxy.toFixed(2)}`);
        } else if (proxy === eoa) {
            console.log(`   🔹 Proxy: Mesma da EOA`);
        } else {
            console.log(`   🔹 Proxy: Não detectada`);
        }

        // Try CLOB Balance if creds are present
        if ((user as any).wallet?.clobCreds?.key) {
            try {
                const clobClient = await getClobClientForUser(user);
                if (clobClient) {
                    const balClob = await getMyBalance(clobClient);
                    console.log(`   🟢 API CLOB (Funder Check): $${balClob.toFixed(2)}`);
                }
            } catch (e) {
                console.log(`   🔴 API CLOB: Erro ao consultar`);
            }
        }
        
        console.log(`----------------------------------------`);
    }
    
    await mongoose.connection.close();
}

checkAllUserBalances();
