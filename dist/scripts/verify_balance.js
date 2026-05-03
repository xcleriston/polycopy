var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import getMyBalance from '../utils/getMyBalance.js';
import { ENV } from '../config/env.js';
function verify() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("🚀 Starting Balance Verification...");
        const testAddresses = [
            { name: "Configured Proxy", address: ENV.PROXY_WALLET },
            { name: "Vitalik", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
            { name: "Empty Address", address: "0x0000000000000000000000000000000000000000" }
        ].filter(a => a.address);
        for (const test of testAddresses) {
            console.log(`\n--- Testing ${test.name}: ${test.address} ---`);
            try {
                const balance = yield getMyBalance(test.address);
                console.log(`✅ Success! Total Balance: $${balance.toFixed(2)}`);
            }
            catch (error) {
                console.error(`❌ Failed for ${test.name}:`, error.message);
            }
        }
    });
}
verify().catch(console.error);
