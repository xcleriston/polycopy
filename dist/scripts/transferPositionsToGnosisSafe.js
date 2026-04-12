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
const RPC_URL = env_1.ENV.RPC_URL;
const EOA_ADDRESS = env_1.ENV.PROXY_WALLET;
const GNOSIS_SAFE_ADDRESS = process.env.GNOSIS_SAFE_ADDRESS || '';
// Polymarket Conditional Tokens contract on Polygon (ERC1155)
const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
function transferPositions() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n🔄 TRANSFERRING POSITIONS FROM EOA TO GNOSIS SAFE\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📍 Addresses:\n');
        console.log(`   FROM (EOA):          ${EOA_ADDRESS}`);
        console.log(`   TO (Gnosis Safe):    ${GNOSIS_SAFE_ADDRESS}\n`);
        // Step 1: Get all positions on EOA
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📋 STEP 1: Fetching positions on EOA\n');
        const positions = yield (0, fetchData_1.default)(`https://data-api.polymarket.com/positions?user=${EOA_ADDRESS}`);
        if (!positions || positions.length === 0) {
            console.log('❌ No positions on EOA to transfer\n');
            return;
        }
        console.log(`✅ Found positions: ${positions.length}`);
        console.log(`💰 Total value: $${positions.reduce((s, p) => s + p.currentValue, 0).toFixed(2)}\n`);
        // Step 2: Connect to network
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📋 STEP 2: Connecting to Polygon\n');
        const provider = new ethers_1.ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers_1.ethers.Wallet(PRIVATE_KEY, provider);
        console.log(`✅ Connected to Polygon\n`);
        console.log(`   Wallet: ${wallet.address}\n`);
        // Verify this is the correct wallet
        if (wallet.address.toLowerCase() !== EOA_ADDRESS.toLowerCase()) {
            console.log('❌ ERROR: Private key does not match EOA address!\n');
            console.log(`   Expected: ${EOA_ADDRESS}`);
            console.log(`   Got:      ${wallet.address}\n`);
            return;
        }
        // Step 3: ERC1155 ABI for safeTransferFrom
        const erc1155Abi = [
            'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
            'function balanceOf(address account, uint256 id) view returns (uint256)',
            'function isApprovedForAll(address account, address operator) view returns (bool)',
            'function setApprovalForAll(address operator, bool approved)',
        ];
        // Step 4: Transfer each position
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📋 STEP 3: Transferring positions\n');
        let successCount = 0;
        let failureCount = 0;
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            console.log(`\n📦 Position ${i + 1}/${positions.length}`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`Market: ${pos.title || 'Unknown'}`);
            console.log(`Outcome: ${pos.outcome || 'Unknown'}`);
            console.log(`Size: ${pos.size.toFixed(2)} shares`);
            console.log(`Value: $${pos.currentValue.toFixed(2)}`);
            console.log(`Token ID: ${pos.asset.slice(0, 20)}...`);
            try {
                // Conditional Tokens contract (stores ERC1155 tokens)
                const ctfContract = new ethers_1.ethers.Contract(CONDITIONAL_TOKENS, erc1155Abi, wallet);
                // Check balance on EOA
                const balance = yield ctfContract.balanceOf(EOA_ADDRESS, pos.asset);
                console.log(`\n📊 Balance on EOA: ${ethers_1.ethers.utils.formatUnits(balance, 0)} tokens`);
                if (balance.isZero()) {
                    console.log('⚠️  Skipping: Balance is zero\n');
                    failureCount++;
                    continue;
                }
                // Get gas price
                const gasPrice = yield provider.getGasPrice();
                const gasPriceWithBuffer = gasPrice.mul(150).div(100); // +50% buffer
                console.log(`⛽ Gas price: ${ethers_1.ethers.utils.formatUnits(gasPriceWithBuffer, 'gwei')} Gwei\n`);
                // Check approval
                const isApproved = yield ctfContract.isApprovedForAll(EOA_ADDRESS, GNOSIS_SAFE_ADDRESS);
                if (!isApproved) {
                    console.log('🔓 Setting approval for Gnosis Safe...');
                    const approveTx = yield ctfContract.setApprovalForAll(GNOSIS_SAFE_ADDRESS, true, {
                        gasPrice: gasPriceWithBuffer,
                        gasLimit: 100000,
                    });
                    yield approveTx.wait();
                    console.log('✅ Approval set\n');
                }
                // Transfer tokens
                console.log(`🔄 Transferring ${ethers_1.ethers.utils.formatUnits(balance, 0)} tokens...`);
                const transferTx = yield ctfContract.safeTransferFrom(EOA_ADDRESS, GNOSIS_SAFE_ADDRESS, pos.asset, balance, '0x', // empty data
                {
                    gasPrice: gasPriceWithBuffer,
                    gasLimit: 200000,
                });
                console.log(`⏳ TX sent: ${transferTx.hash}`);
                console.log('⏳ Waiting for confirmation...');
                const receipt = yield transferTx.wait();
                console.log(`✅ SUCCESS! Block: ${receipt.blockNumber}`);
                console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
                successCount++;
                // Pause between transfers
                if (i < positions.length - 1) {
                    console.log('\n⏳ Pausing 3 seconds...\n');
                    yield new Promise((resolve) => setTimeout(resolve, 3000));
                }
            }
            catch (error) {
                console.log(`\n❌ ERROR during transfer:`);
                console.log(`   ${error.message}\n`);
                failureCount++;
            }
        }
        // Step 5: Summary
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 TRANSFER SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log(`✅ Successfully transferred: ${successCount}/${positions.length}`);
        console.log(`❌ Errors: ${failureCount}/${positions.length}\n`);
        // Step 6: Verify result
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📋 STEP 4: Verifying result\n');
        console.log('⏳ Waiting 5 seconds for API data to update...\n');
        yield new Promise((resolve) => setTimeout(resolve, 5000));
        const eoaPositionsAfter = yield (0, fetchData_1.default)(`https://data-api.polymarket.com/positions?user=${EOA_ADDRESS}`);
        const gnosisPositionsAfter = yield (0, fetchData_1.default)(`https://data-api.polymarket.com/positions?user=${GNOSIS_SAFE_ADDRESS}`);
        console.log('📊 AFTER TRANSFER:\n');
        console.log(`   EOA:          ${(eoaPositionsAfter === null || eoaPositionsAfter === void 0 ? void 0 : eoaPositionsAfter.length) || 0} positions`);
        console.log(`   Gnosis Safe:  ${(gnosisPositionsAfter === null || gnosisPositionsAfter === void 0 ? void 0 : gnosisPositionsAfter.length) || 0} positions\n`);
        if (gnosisPositionsAfter && gnosisPositionsAfter.length > 0) {
            console.log('✅ Positions successfully transferred to Gnosis Safe!\n');
            console.log('🔗 Check on Polymarket:\n');
            console.log(`   https://polymarket.com/profile/${GNOSIS_SAFE_ADDRESS}\n`);
        }
        else {
            console.log('⚠️  API has not updated yet. Wait a few minutes and check manually.\n');
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('✅ Script completed!\n');
    });
}
transferPositions().catch((error) => {
    console.error('\n❌ Critical error:', error);
    process.exit(1);
});
