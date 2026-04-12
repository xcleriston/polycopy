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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const env_1 = require("../config/env");
const fetchData_1 = __importDefault(require("../utils/fetchData"));
const PRIVATE_KEY = env_1.ENV.PRIVATE_KEY;
const PROXY_WALLET = env_1.ENV.PROXY_WALLET;
const RPC_URL = env_1.ENV.RPC_URL;
function analyzeWallets() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n🔍 WALLET AND ADDRESS ANALYSIS\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        // Step 1: Get EOA address from private key
        const wallet = new ethers_1.ethers.Wallet(PRIVATE_KEY);
        const eoaAddress = wallet.address;
        console.log('📋 STEP 1: Address from private key (EOA)\n');
        console.log(`   ${eoaAddress}\n`);
        // Step 2: Show PROXY_WALLET from .env
        console.log('📋 STEP 2: PROXY_WALLET from .env\n');
        console.log(`   ${PROXY_WALLET}\n`);
        // Step 3: Compare
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🔎 COMPARISON:\n');
        if (eoaAddress.toLowerCase() === PROXY_WALLET.toLowerCase()) {
            console.log('   ⚠️  EOA AND PROXY_WALLET ARE THE SAME ADDRESS!\n');
            console.log('   This means .env has EOA address, not proxy wallet.\n');
            console.log('   Polymarket should have created a separate proxy wallet for this EOA,');
            console.log('   but the bot is using the EOA directly.\n');
        }
        else {
            console.log('   ✅ EOA and PROXY_WALLET are different addresses\n');
            console.log('   EOA (owner):        ', eoaAddress);
            console.log('   PROXY (for trading): ', PROXY_WALLET, '\n');
        }
        // Step 4: Check if PROXY_WALLET is a smart contract
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📋 STEP 3: Checking PROXY_WALLET type\n');
        const provider = new ethers_1.ethers.providers.JsonRpcProvider(RPC_URL);
        const code = yield provider.getCode(PROXY_WALLET);
        const isContract = code !== '0x';
        if (isContract) {
            console.log('   ✅ PROXY_WALLET is a smart contract (Gnosis Safe)\n');
            console.log('   This is the correct configuration for Polymarket.\n');
        }
        else {
            console.log('   ⚠️  PROXY_WALLET is NOT a smart contract!\n');
            console.log('   This is a regular EOA address.\n');
            console.log('   Polymarket usually uses Gnosis Safe proxy.\n');
        }
        // Step 5: Check activity of both addresses
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📋 STEP 4: Activity on Polymarket\n');
        try {
            const proxyPositions = yield (0, fetchData_1.default)(`https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`);
            console.log(`   PROXY_WALLET (${PROXY_WALLET.slice(0, 10)}...):`);
            console.log(`   • Positions: ${(proxyPositions === null || proxyPositions === void 0 ? void 0 : proxyPositions.length) || 0}\n`);
            if (eoaAddress.toLowerCase() !== PROXY_WALLET.toLowerCase()) {
                const eoaPositions = yield (0, fetchData_1.default)(`https://data-api.polymarket.com/positions?user=${eoaAddress}`);
                console.log(`   EOA (${eoaAddress.slice(0, 10)}...):`);
                console.log(`   • Positions: ${(eoaPositions === null || eoaPositions === void 0 ? void 0 : eoaPositions.length) || 0}\n`);
            }
        }
        catch (error) {
            console.log('   ⚠️  Failed to get position data\n');
        }
        // Step 6: Check connection via activity API
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📋 STEP 5: Checking proxyWallet in transactions\n');
        try {
            const activities = yield (0, fetchData_1.default)(`https://data-api.polymarket.com/activity?user=${PROXY_WALLET}&type=TRADE`);
            if (activities && activities.length > 0) {
                const firstTrade = activities[0];
                const proxyWalletInTrade = firstTrade.proxyWallet;
                console.log(`   Address from .env:        ${PROXY_WALLET}`);
                console.log(`   proxyWallet in trades:     ${proxyWalletInTrade}\n`);
                if (proxyWalletInTrade.toLowerCase() === PROXY_WALLET.toLowerCase()) {
                    console.log('   ✅ Addresses match!\n');
                }
                else {
                    console.log('   ⚠️  ADDRESSES DO NOT MATCH!\n');
                    console.log('   This may mean Polymarket uses a different proxy.\n');
                }
            }
        }
        catch (error) {
            console.log('   ⚠️  Failed to check transactions\n');
        }
        // Step 7: Instructions
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('💡 HOW TO ACCESS POSITIONS ON FRONTEND:\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🔧 OPTION 1: Import private key into MetaMask\n');
        console.log('   1. Open MetaMask');
        console.log('   2. Click account icon -> Import Account');
        console.log('   3. Paste your PRIVATE_KEY from .env file');
        console.log('   4. Connect to Polymarket with this account');
        console.log('   5. Polymarket will automatically show the correct proxy wallet\n');
        console.log('⚠️  WARNING: Never share your private key!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🔧 OPTION 2: Find proxy wallet via URL\n');
        console.log(`   Your positions are available at:\n`);
        console.log(`   https://polymarket.com/profile/${PROXY_WALLET}\n`);
        console.log(`   Open this link in browser to view.\n`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🔧 OPTION 3: Check via Polygon Explorer\n');
        console.log(`   https://polygonscan.com/address/${PROXY_WALLET}\n`);
        console.log(`   Here you can see all transactions and tokens.\n`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        // Step 8: Additional information
        console.log('📚 ADDITIONAL INFORMATION:\n');
        console.log('   • EOA (Externally Owned Account) - your main wallet');
        console.log('   • Proxy Wallet - smart contract for trading on Polymarket');
        console.log('   • One EOA can have only one proxy wallet on Polymarket');
        console.log('   • All positions are stored in proxy wallet, not in EOA\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        // Step 9: Export connection information
        console.log('📋 CONNECTION DATA:\n');
        console.log(`   EOA address:       ${eoaAddress}`);
        console.log(`   Proxy address:     ${PROXY_WALLET}`);
        console.log(`   Proxy type:        ${isContract ? 'Smart Contract (Gnosis Safe)' : 'EOA (simple address)'}\n`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    });
}
analyzeWallets().catch(console.error);
