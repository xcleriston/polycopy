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
/**
 * Fetches USDC balance.
 * Supports both ClobClient (accurate for CLOB funds)
 * and wallet address (fast RPC check for EOA/Proxy).
 */
const getMyBalance = (clientOrAddress) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (typeof clientOrAddress === 'string') {
            // FAST RPC CHECK (Used by Dashboard)
            const provider = new ethers.providers.JsonRpcProvider(ENV.RPC_URL);
            const usdc = new ethers.Contract(ENV.USDC_CONTRACT_ADDRESS, USDC_ABI, provider);
            const balance = yield usdc.balanceOf(clientOrAddress);
            return parseFloat(ethers.utils.formatUnits(balance, 6));
        }
        else {
            // ACCURATE CLOB CHECK (Used by Executor)
            const balanceData = yield clientOrAddress.getBalanceAllowance({
                asset_type: "COLLATERAL"
            });
            return parseFloat(balanceData.balance || "0");
        }
    }
    catch (e) {
        Logger.error(`[BALANCE] Failed to fetch for ${typeof clientOrAddress === 'string' ? clientOrAddress : 'Client'}: ${e.message}`);
        return 0;
    }
});
export default getMyBalance;
