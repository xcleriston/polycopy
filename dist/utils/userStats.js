var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import User from '../models/user.js';
import getMyBalance from './getMyBalance.js';
import fetchData from './fetchData.js';
import Logger from './logger.js';
/**
 * Force a refresh of user balance and exposure and save to DB
 */
export function refreshUserStats(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const user = yield User.findById(userId);
            if (!user || !((_a = user.wallet) === null || _a === void 0 ? void 0 : _a.address))
                return false;
            const mainAddress = user.wallet.address;
            const proxyAddress = user.wallet.proxyAddress || mainAddress;
            const balance = yield getMyBalance(mainAddress, proxyAddress);
            // Fetch positions to calculate exposure
            const positionsData = yield fetchData(`https://data-api.polymarket.com/positions?user=${proxyAddress}`);
            const exposure = (positionsData || []).reduce((sum, pos) => sum + (pos.currentValue || 0), 0);
            yield User.updateOne({ _id: userId }, {
                $set: {
                    'stats.balance': balance,
                    'stats.exposure': exposure,
                    'stats.lastUpdate': new Date()
                }
            });
            Logger.info(`[STATS] Refreshed balance for ${user.username || user.chatId}: $${balance.toFixed(2)}`);
            return true;
        }
        catch (e) {
            Logger.error(`[STATS] Failed to refresh stats for ${userId}: ${e}`);
            return false;
        }
    });
}
