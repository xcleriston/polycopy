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
const clob_client_1 = require("@polymarket/clob-client");
const order_utils_1 = require("@polymarket/order-utils");
const env_1 = require("../config/env");
const PROXY_WALLET = env_1.ENV.PROXY_WALLET;
const PRIVATE_KEY = env_1.ENV.PRIVATE_KEY;
const RPC_URL = env_1.ENV.RPC_URL;
const USDC_CONTRACT_ADDRESS = env_1.ENV.USDC_CONTRACT_ADDRESS;
const CLOB_HTTP_URL = env_1.ENV.CLOB_HTTP_URL;
const POLYGON_CHAIN_ID = 137;
const POLYMARKET_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const POLYMARKET_EXCHANGE_LOWER = POLYMARKET_EXCHANGE.toLowerCase();
const POLYMARKET_COLLATERAL = (0, clob_client_1.getContractConfig)(POLYGON_CHAIN_ID).collateral;
const POLYMARKET_COLLATERAL_LOWER = POLYMARKET_COLLATERAL.toLowerCase();
const NATIVE_USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const NATIVE_USDC_LOWER = NATIVE_USDC_ADDRESS.toLowerCase();
// USDC ABI (only the functions we need)
const USDC_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
];
const buildClobClient = (provider) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const wallet = new ethers_1.ethers.Wallet(PRIVATE_KEY, provider);
    const code = yield provider.getCode(PROXY_WALLET);
    const isProxySafe = code !== '0x';
    const signatureType = isProxySafe ? order_utils_1.SignatureType.POLY_GNOSIS_SAFE : order_utils_1.SignatureType.EOA;
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = function () { };
    console.error = function () { };
    const initialClient = new clob_client_1.ClobClient(CLOB_HTTP_URL, POLYGON_CHAIN_ID, wallet, undefined, signatureType, isProxySafe ? PROXY_WALLET : undefined);
    let creds;
    let createWarning;
    let deriveWarning;
    try {
        try {
            creds = yield initialClient.createApiKey();
        }
        catch (createError) {
            const msg = ((_b = (_a = createError === null || createError === void 0 ? void 0 : createError.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) || (createError === null || createError === void 0 ? void 0 : createError.message);
            createWarning = `⚠️  Unable to create new API key${msg ? `: ${msg}` : ''}`;
        }
        if (!(creds === null || creds === void 0 ? void 0 : creds.key)) {
            try {
                creds = yield initialClient.deriveApiKey();
            }
            catch (deriveError) {
                const msg = ((_d = (_c = deriveError === null || deriveError === void 0 ? void 0 : deriveError.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.error) || (deriveError === null || deriveError === void 0 ? void 0 : deriveError.message);
                deriveWarning = `⚠️  Unable to derive API key${msg ? `: ${msg}` : ''}`;
            }
        }
    }
    finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }
    if (createWarning) {
        console.log(createWarning);
    }
    if (deriveWarning) {
        console.log(deriveWarning);
    }
    if (!(creds === null || creds === void 0 ? void 0 : creds.key)) {
        throw new Error('Failed to obtain Polymarket API credentials');
    }
    return new clob_client_1.ClobClient(CLOB_HTTP_URL, POLYGON_CHAIN_ID, wallet, creds, signatureType, isProxySafe ? PROXY_WALLET : undefined);
});
const formatClobAmount = (raw, decimals) => {
    try {
        return ethers_1.ethers.utils.formatUnits(raw, decimals);
    }
    catch (_a) {
        const numeric = parseFloat(raw);
        if (!Number.isFinite(numeric)) {
            return raw;
        }
        return numeric.toFixed(Math.min(decimals, 6));
    }
};
const syncPolymarketAllowanceCache = (decimals, provider) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('🔄 Syncing Polymarket allowance cache...');
        const clobClient = yield buildClobClient(provider);
        const updateParams = {
            asset_type: clob_client_1.AssetType.COLLATERAL,
        };
        const updateResult = yield clobClient.updateBalanceAllowance(updateParams);
        if (updateResult && typeof updateResult === 'object' && 'error' in updateResult) {
            console.log(`⚠️  Polymarket cache update failed: ${updateResult.error}`);
            return;
        }
        if (updateResult === '' || updateResult === null || updateResult === undefined) {
            console.log('ℹ  Polymarket cache update acknowledged (empty response).');
        }
        else if (typeof updateResult !== 'object') {
            console.log('⚠️  Polymarket cache update returned an unexpected response:', JSON.stringify(updateResult));
        }
        else {
            console.log('ℹ  Polymarket cache update response:', JSON.stringify(updateResult));
        }
        const balanceResponse = yield clobClient.getBalanceAllowance(updateParams);
        if (!balanceResponse || typeof balanceResponse !== 'object') {
            console.log('⚠️  Unexpected response from Polymarket when fetching balance/allowance:', JSON.stringify(balanceResponse));
            return;
        }
        if ('error' in balanceResponse) {
            console.log(`⚠️  Unable to fetch Polymarket balance/allowance: ${balanceResponse.error}`);
            return;
        }
        const { balance, allowance } = balanceResponse;
        let allowanceValue = allowance;
        if (!allowanceValue && balanceResponse.allowances) {
            for (const [address, value] of Object.entries(balanceResponse.allowances)) {
                if (address.toLowerCase() === POLYMARKET_EXCHANGE_LOWER &&
                    typeof value === 'string') {
                    allowanceValue = value;
                    break;
                }
            }
        }
        if (balance === undefined || allowanceValue === undefined) {
            console.log('⚠️  Polymarket did not provide balance/allowance data. Raw response:', JSON.stringify(balanceResponse));
            return;
        }
        const syncedBalance = formatClobAmount(balance, decimals);
        const syncedAllowance = formatClobAmount(allowanceValue, decimals);
        console.log(`💾 Polymarket Recorded Balance: ${syncedBalance} USDC`);
        console.log(`💾 Polymarket Recorded Allowance: ${syncedAllowance} USDC\n`);
    }
    catch (syncError) {
        console.log(`⚠️  Unable to sync Polymarket cache: ${(syncError === null || syncError === void 0 ? void 0 : syncError.message) || syncError}`);
    }
});
function checkAndSetAllowance() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🔍 Checking USDC balance and allowance...\n');
        // Connect to Polygon
        const provider = new ethers_1.ethers.providers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers_1.ethers.Wallet(PRIVATE_KEY, provider);
        // Create USDC contract instance
        const usdcContract = new ethers_1.ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, wallet);
        try {
            // Get USDC decimals
            const decimals = yield usdcContract.decimals();
            console.log(`💵 USDC Decimals: ${decimals}`);
            const usesPolymarketCollateral = USDC_CONTRACT_ADDRESS.toLowerCase() === POLYMARKET_COLLATERAL_LOWER;
            // Local token balance & allowance (whatever is configured in .env)
            const localBalance = yield usdcContract.balanceOf(PROXY_WALLET);
            const localAllowance = yield usdcContract.allowance(PROXY_WALLET, POLYMARKET_EXCHANGE);
            const localBalanceFormatted = ethers_1.ethers.utils.formatUnits(localBalance, decimals);
            const localAllowanceFormatted = ethers_1.ethers.utils.formatUnits(localAllowance, decimals);
            console.log(`💰 Your USDC Balance (${USDC_CONTRACT_ADDRESS}): ${localBalanceFormatted} USDC`);
            console.log(`✅ Current Allowance (${USDC_CONTRACT_ADDRESS}): ${localAllowanceFormatted} USDC`);
            console.log(`📍 Polymarket Exchange: ${POLYMARKET_EXCHANGE}\n`);
            if (USDC_CONTRACT_ADDRESS.toLowerCase() !== NATIVE_USDC_LOWER) {
                try {
                    const nativeContract = new ethers_1.ethers.Contract(NATIVE_USDC_ADDRESS, USDC_ABI, wallet);
                    const nativeDecimals = yield nativeContract.decimals();
                    const nativeBalance = yield nativeContract.balanceOf(PROXY_WALLET);
                    if (!nativeBalance.isZero()) {
                        const nativeFormatted = ethers_1.ethers.utils.formatUnits(nativeBalance, nativeDecimals);
                        console.log('ℹ️  Detected native USDC (Polygon PoS) balance:');
                        console.log(`    ${nativeFormatted} tokens at ${NATIVE_USDC_ADDRESS}`);
                        console.log('    Polymarket does not recognize this token. Swap to USDC.e (0x2791...) to trade.\n');
                    }
                }
                catch (nativeError) {
                    console.log(`⚠️  Unable to check native USDC balance: ${nativeError}`);
                }
            }
            // Determine the contract Polymarket actually reads from (USDC.e)
            const polymarketContract = usesPolymarketCollateral
                ? usdcContract
                : new ethers_1.ethers.Contract(POLYMARKET_COLLATERAL, USDC_ABI, wallet);
            const polymarketDecimals = usesPolymarketCollateral
                ? decimals
                : yield polymarketContract.decimals();
            const polymarketBalance = usesPolymarketCollateral
                ? localBalance
                : yield polymarketContract.balanceOf(PROXY_WALLET);
            const polymarketAllowance = usesPolymarketCollateral
                ? localAllowance
                : yield polymarketContract.allowance(PROXY_WALLET, POLYMARKET_EXCHANGE);
            if (!usesPolymarketCollateral) {
                const polymarketBalanceFormatted = ethers_1.ethers.utils.formatUnits(polymarketBalance, polymarketDecimals);
                const polymarketAllowanceFormatted = ethers_1.ethers.utils.formatUnits(polymarketAllowance, polymarketDecimals);
                console.log('⚠️  Polymarket collateral token is USDC.e (bridged) at address');
                console.log(`    ${POLYMARKET_COLLATERAL}`);
                console.log(`⚠️  Polymarket-tracked USDC balance: ${polymarketBalanceFormatted} USDC`);
                console.log(`⚠️  Polymarket-tracked allowance: ${polymarketAllowanceFormatted} USDC\n`);
                console.log('👉  Swap native USDC to USDC.e or update your .env to point at the collateral token before trading.\n');
            }
            if (polymarketAllowance.lt(polymarketBalance) || polymarketAllowance.isZero()) {
                console.log('⚠️  Allowance is insufficient or zero!');
                console.log('📝 Setting unlimited allowance for Polymarket...\n');
                // Approve unlimited amount (max uint256)
                const maxAllowance = ethers_1.ethers.constants.MaxUint256;
                // Get current gas price and add 50% buffer
                const feeData = yield provider.getFeeData();
                const gasPrice = feeData.gasPrice
                    ? feeData.gasPrice.mul(150).div(100)
                    : ethers_1.ethers.utils.parseUnits('50', 'gwei');
                console.log(`⛽ Gas Price: ${ethers_1.ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`);
                const approveTx = yield polymarketContract.approve(POLYMARKET_EXCHANGE, maxAllowance, {
                    gasPrice: gasPrice,
                    gasLimit: 100000,
                });
                console.log(`⏳ Transaction sent: ${approveTx.hash}`);
                console.log('⏳ Waiting for confirmation...\n');
                const receipt = yield approveTx.wait();
                if (receipt.status === 1) {
                    console.log('✅ Allowance set successfully!');
                    console.log(`🔗 Transaction: https://polygonscan.com/tx/${approveTx.hash}\n`);
                    // Verify new allowance
                    const newAllowance = yield polymarketContract.allowance(PROXY_WALLET, POLYMARKET_EXCHANGE);
                    const newAllowanceFormatted = ethers_1.ethers.utils.formatUnits(newAllowance, polymarketDecimals);
                    console.log(`✅ New Allowance: ${newAllowanceFormatted} USDC`);
                }
                else {
                    console.log('❌ Transaction failed!');
                }
            }
            else {
                console.log('✅ Allowance is already sufficient! No action needed.');
            }
            yield syncPolymarketAllowanceCache(polymarketDecimals, provider);
        }
        catch (error) {
            console.error('❌ Error:', error.message);
            if (error.code === 'INSUFFICIENT_FUNDS') {
                console.log('\n⚠️  You need MATIC for gas fees on Polygon!');
            }
        }
    });
}
checkAndSetAllowance()
    .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
})
    .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
