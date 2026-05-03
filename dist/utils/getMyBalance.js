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
import { ENV } from '../config/env.js';
import Logger from './logger.js';
const USDC_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];
const RPC_LIST = [
    ENV.RPC_URL,
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.quiknode.pro',
    'https://1rpc.io/matic',
    'https://polygon.llamarpc.com'
].filter(Boolean);
/**
 * Fetches USDC balance.
 * Supports both ClobClient (accurate for CLOB funds)
 * and wallet address (fast RPC check for EOA/Proxy).
 */
const getMyBalance = (clientOrAddress) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (typeof clientOrAddress === 'string') {
            const address = clientOrAddress;
            const usdcAddr = ENV.USDC_CONTRACT_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
            for (const rpc of RPC_LIST) {
                try {
                    const provider = new ethers.providers.JsonRpcProvider({
                        url: rpc,
                        skipFetchSetup: true // Some RPCs hate the default headers
                    }, 137);
                    const usdc = new ethers.Contract(usdcAddr, USDC_ABI, provider);
                    const balance = yield usdc.balanceOf(address);
                    let finalBalance = parseFloat(ethers.utils.formatUnits(balance, 6));
                    // PARANOID CHECK: If formatted balance is > 100M USD, something is wrong with the decimal shift
                    if (finalBalance > 100000000) {
                        Logger.warning(`[BALANCE] Suspiciously high balance ($${finalBalance}) for ${address.slice(0, 6)}. Applying emergency 10^6 division.`);
                        finalBalance /= 1000000;
                    }
                    if (finalBalance > 0) {
                        Logger.info(`[BALANCE] Successfully fetched $${finalBalance} for ${address.slice(0, 6)} via ${rpc}`);
                    }
                    return finalBalance;
                }
                catch (rpcErr) {
                    Logger.warning(`[BALANCE] RPC ${rpc} failed for ${address.slice(0, 6)}: ${rpcErr instanceof Error ? rpcErr.message : 'Unknown'}`);
                    continue;
                }
            }
            throw new Error("All RPCs failed");
        }
        else {
            // ACCURATE CLOB CHECK
            const funder = (_a = clientOrAddress.orderBuilder) === null || _a === void 0 ? void 0 : _a.funderAddress;
            Logger.debug(`[BALANCE] Fetching CLOB balance for funder: ${funder || 'Signer'}`);
            const balanceData = yield clientOrAddress.getBalanceAllowance({
                asset_type: "COLLATERAL",
                funder: funder
            });
            Logger.debug(`[BALANCE] CLOB Raw Response: ${JSON.stringify(balanceData)}`);
            const val = parseFloat(balanceData.balance || "0");
            // IMPROVED DECIMAL HANDLING: 
            // If the value is huge (>1M), it's definitely raw units (6 decimals)
            // If it's small, we assume it's already in human-readable USDC
            if (val > 1000000) {
                return val / 1000000;
            }
            return val;
        }
    }
    catch (e) {
        Logger.error(`[BALANCE] Critical failure for ${typeof clientOrAddress === 'string' ? clientOrAddress : 'Client'}: ${e.message}`);
        return 0;
    }
});
export default getMyBalance;
