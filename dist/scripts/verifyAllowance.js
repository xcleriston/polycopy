"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const env_1 = require("../config/env");
const PROXY_WALLET = env_1.ENV.PROXY_WALLET;
const RPC_URL = env_1.ENV.RPC_URL;
const USDC_CONTRACT_ADDRESS = env_1.ENV.USDC_CONTRACT_ADDRESS;
// Polymarket's CTF Exchange contract address on Polygon
const POLYMARKET_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
// USDC ABI (only the functions we need)
const USDC_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
];
function verifyAllowance() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🔍 Verifying USDC allowance status...\n');
        // Connect to Polygon
        const provider = new ethers_1.ethers.providers.JsonRpcProvider(RPC_URL);
        // Create USDC contract instance (read-only, no wallet needed)
        const usdcContract = new ethers_1.ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, provider);
        try {
            // Get USDC decimals
            const decimals = yield usdcContract.decimals();
            // Check balance
            const balance = yield usdcContract.balanceOf(PROXY_WALLET);
            const balanceFormatted = ethers_1.ethers.utils.formatUnits(balance, decimals);
            // Check current allowance
            const currentAllowance = yield usdcContract.allowance(PROXY_WALLET, POLYMARKET_EXCHANGE);
            const allowanceFormatted = ethers_1.ethers.utils.formatUnits(currentAllowance, decimals);
            console.log('═'.repeat(70));
            console.log('📊 WALLET STATUS');
            console.log('═'.repeat(70));
            console.log(`💼 Wallet:     ${PROXY_WALLET}`);
            console.log(`💵 USDC:       ${balanceFormatted} USDC`);
            console.log(`✅ Allowance:  ${currentAllowance.isZero() ? '0 USDC (NOT SET!)' : allowanceFormatted + ' USDC (SET!)'}`);
            console.log(`📍 Exchange:   ${POLYMARKET_EXCHANGE}`);
            console.log('═'.repeat(70));
            if (currentAllowance.isZero()) {
                console.log('\n❌ PROBLEM: Allowance is NOT set!');
                console.log('\n📝 TO FIX: Run the following command:');
                console.log('   npm run check-allowance');
                console.log('\nOR wait for your pending transaction to confirm:');
                console.log('   https://polygonscan.com/address/' + PROXY_WALLET);
                process.exit(1);
            }
            else if (currentAllowance.lt(balance)) {
                console.log('\n⚠️  WARNING: Allowance is less than your balance!');
                console.log(`   You may not be able to trade your full balance.`);
                console.log(`\n   Balance:   ${balanceFormatted} USDC`);
                console.log(`   Allowance: ${allowanceFormatted} USDC`);
                console.log(`\n   Consider setting unlimited allowance:`);
                console.log('   npm run check-allowance');
                process.exit(1);
            }
            else {
                console.log('\n✅ SUCCESS: Allowance is properly set!');
                console.log('   You can start trading now.');
                console.log('\n🚀 Start the bot:');
                console.log('   npm run dev');
                process.exit(0);
            }
        }
        catch (error) {
            console.error('\n❌ Error:', error.message);
            process.exit(1);
        }
    });
}
verifyAllowance();
