import mongoose from 'mongoose';
import { Activity } from '../models/userHistory.js';
import User from '../models/user.js';
import { postOrder, recordStatus } from '../utils/postOrder.js';
import { getClobClientForUser, findProxyWallet } from '../utils/createClobClient.js';
import getMyBalance from '../utils/getMyBalance.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('🚀 [WAR-MODE] Forçando execução direta do último trade...');
    
    const trade = await Activity.findOne({ 
        slug: 'nhl-min-col-2026-05-03',
        side: 'BUY'
    }).sort({ timestamp: -1 });

    if (!trade) {
        console.log('❌ Trade não encontrado.');
        await mongoose.connection.close();
        return;
    }

    const follower = await User.findById("69dfe485f83e34811ecef999");
    if (!follower) {
        console.log('❌ Usuário não encontrado.');
        await mongoose.connection.close();
        return;
    }

    console.log(`🎯 Processando para ${follower.username}...`);

    const clobClient = await getClobClientForUser(follower);
    const proxyAddr = await findProxyWallet(follower);
    const my_balance = await getMyBalance(clobClient);

    const result = await postOrder(
        clobClient,
        'buy',
        null, // No position for this test
        null, // No user position for this test
        trade,
        my_balance,
        follower._id.toString(),
        follower.config,
        [],
        proxyAddr
    );

    if (result.success) {
        console.log('✅ SUCESSO REAL! Gravando no banco...');
        await recordStatus(trade._id, follower._id.toString(), 'SUCESSO', 'Forçado manualmente via TaskForce', {
            processed: true,
            myEntryAmount: result.amount,
            myEntryPrice: result.price,
            myExecutedAt: new Date()
        });
    } else {
        console.log(`❌ FALHA REAL: ${result.error}`);
    }

    await mongoose.connection.close();
}
run();
