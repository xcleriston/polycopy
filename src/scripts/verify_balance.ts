import { ethers } from 'ethers';
import getMyBalance from '../utils/getMyBalance.js';
import { ENV } from '../config/env.js';

async function verify() {
    console.log("🚀 Starting Balance Verification...");
    
    const testAddresses = [
        { name: "Configured Proxy", address: ENV.PROXY_WALLET },
        { name: "Vitalik", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
        { name: "Empty Address", address: "0x0000000000000000000000000000000000000000" }
    ].filter(a => a.address);

    for (const test of testAddresses) {
        console.log(`\n--- Testing ${test.name}: ${test.address} ---`);
        try {
            const balance = await getMyBalance(test.address as string);
            console.log(`✅ Success! Total Balance: $${balance.toFixed(2)}`);
        } catch (error: any) {
            console.error(`❌ Failed for ${test.name}:`, error.message);
        }
    }
}

verify().catch(console.error);
