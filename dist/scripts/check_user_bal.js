import connectDB, { closeDB } from './src/config/db.js';
import User from './src/models/user.js';
import { getClobClientForUser } from './src/utils/createClobClient.js';
import getMyBalance from './src/utils/getMyBalance.js';
async function check() {
    await connectDB();
    try {
        const user = await User.findOne({ username: 'copiador' });
        if (!user) {
            console.log('User not found');
            return;
        }
        console.log(`User: ${user.username}`);
        console.log(`Wallet: ${user.wallet?.address}`);
        console.log(`Proxy: ${user.wallet?.proxyAddress}`);
        const clobClient = await getClobClientForUser(user);
        if (clobClient) {
            const bal = await getMyBalance(clobClient);
            console.log(`CLOB Balance: ${bal} USDC`);
        }
        else {
            console.log('Could not initialize CLOB client');
        }
        const NATIVE_USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
        const BRIDGED_USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
        console.log('\n--- ON-CHAIN BALANCES ---');
        async function logBals(addr, label) {
            if (!addr)
                return;
            // Native
            process.env.USDC_CONTRACT_ADDRESS = NATIVE_USDC;
            const balNative = await getMyBalance(addr);
            // Bridged
            process.env.USDC_CONTRACT_ADDRESS = BRIDGED_USDC;
            const balBridged = await getMyBalance(addr);
            console.log(`${label} (${addr}):`);
            console.log(`  Native USDC:  ${balNative} USDC`);
            console.log(`  Bridged USDC: ${balBridged} USDC`);
        }
        await logBals(user.wallet?.address || '', 'EOA');
        await logBals(user.wallet?.proxyAddress || '', 'Proxy');
    }
    finally {
        await closeDB();
    }
}
check();
