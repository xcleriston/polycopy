var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import createClobClient from './createClobClient.js';
import Logger from './logger.js';
/**
 * AGENT 4: BALANCE FIX ENGINE (Surgical Patch)
 * Fetches real USDC balance from Polymarket CLOB.
 * Ensures the dashboard shows accurate funds for Proxy Wallets.
 */
const getMyBalance = (address, proxy) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const client = yield createClobClient();
        // Force update to sync state
        yield client.updateBalanceAllowance({
            asset_type: "COLLATERAL"
        });
        // Fetch actual balance from Polymarket CLOB
        const balanceData = yield client.getBalanceAllowance({
            asset_type: "COLLATERAL"
        });
        const balance = parseFloat(balanceData.balance || "0");
        Logger.info(`[BALANCE_FIX] Loaded from CLOB: $${balance.toFixed(2)}`);
        return balance;
    }
    catch (e) {
        Logger.error(`[BALANCE_FIX] FAILED: ${e.message}`);
        return 0;
    }
});
export default getMyBalance;
