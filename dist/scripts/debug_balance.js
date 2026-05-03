var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import * as dotenv from 'dotenv';
dotenv.config();
function testBalance() {
    return __awaiter(this, void 0, void 0, function* () {
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
        const client = new ClobClient("https://clob.polymarket.com/", 137, wallet, undefined, signatureType, proxy || undefined);
        try {
            console.log("Deriving API Key...");
            const creds = yield client.deriveApiKey();
            console.log("Creds derived successfully.");
            const authClient = new ClobClient("https://clob.polymarket.com/", 137, wallet, creds, signatureType, proxy || undefined);
            console.log("\n--- Test 1: getBalanceAllowance (No funder param) ---");
            const res1 = yield authClient.getBalanceAllowance({ asset_type: "COLLATERAL" });
            console.log(JSON.stringify(res1, null, 2));
            if (proxy) {
                console.log("\n--- Test 2: getBalanceAllowance (With funder param) ---");
                const res2 = yield authClient.getBalanceAllowance({
                    asset_type: "COLLATERAL",
                    funder: proxy
                });
                console.log(JSON.stringify(res2, null, 2));
            }
        }
        catch (err) {
            console.error("Test failed:", err);
        }
    });
}
testBalance();
