import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import * as dotenv from 'dotenv';
dotenv.config();

async function testBalance() {
    const pk = process.env.PRIVATE_KEY;
    const proxy = process.env.PROXY_WALLET;
    
    if (!pk) {
        console.log("No PRIVATE_KEY in .env");
        return;
    }

    const wallet = new ethers.Wallet(pk);
    console.log(`EOA: ${wallet.address}`);
    console.log(`Proxy: ${proxy || 'None'}`);

    const signatureType = proxy ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;
    
    // We need creds to test getBalanceAllowance
    // If we don't have them, we'll try to derive
    const client = new ClobClient(
        "https://clob.polymarket.com/",
        137,
        wallet,
        undefined,
        signatureType,
        proxy || undefined
    );

    try {
        console.log("Deriving API Key...");
        const creds = await client.deriveApiKey();
        console.log("Creds derived successfully.");

        const authClient = new ClobClient(
            "https://clob.polymarket.com/",
            137,
            wallet,
            creds,
            signatureType,
            proxy || undefined
        );

        console.log("\n--- Test 1: getBalanceAllowance (No funder param) ---");
        const res1 = await authClient.getBalanceAllowance({ asset_type: "COLLATERAL" as any });
        console.log(JSON.stringify(res1, null, 2));

        if (proxy) {
            console.log("\n--- Test 2: getBalanceAllowance (With funder param) ---");
            const res2 = await authClient.getBalanceAllowance({ 
                asset_type: "COLLATERAL" as any,
                funder: proxy
            } as any);
            console.log(JSON.stringify(res2, null, 2));
        }

    } catch (err) {
        console.error("Test failed:", err);
    }
}

testBalance();
