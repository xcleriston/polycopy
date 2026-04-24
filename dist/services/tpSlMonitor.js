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
import Logger from '../utils/logger.js';
import fetchData from '../utils/fetchData.js';
import createClobClient from '../utils/createClobClient.js';
import telegram from '../utils/telegram.js';
import { Side, OrderType } from '@polymarket/clob-client';
const MONITOR_INTERVAL = 30000; // 30 seconds (Balanced frequency)
export const startTpSlMonitor = () => {
    Logger.info('🛡️ Starting Auto TP/SL Risk Monitor...');
    setInterval(checkPositions, MONITOR_INTERVAL);
};
const checkPositions = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Find users with TP or SL configured
        const users = yield User.find({
            $or: [
                { 'config.tpPercent': { $gt: 0 } },
                { 'config.slPercent': { $lt: 0 } }
            ],
            'config.enabled': true,
            'wallet.privateKey': { $exists: true, $ne: '' }
        });
        if (!users || users.length === 0)
            return;
        for (const user of users) {
            yield processUserRisk(user);
        }
    }
    catch (error) {
        Logger.error(`TP/SL Monitor Error: ${error}`);
    }
});
const processUserRisk = (user) => __awaiter(void 0, void 0, void 0, function* () {
    const address = user.wallet.address;
    const tpPercent = user.config.tpPercent || 0;
    const slPercent = user.config.slPercent || 0;
    try {
        // Fetch open positions
        const positionsData = yield fetchData(`https://data-api.polymarket.com/positions?user=${address}`);
        if (!positionsData || !Array.isArray(positionsData))
            return;
        for (const pos of positionsData) {
            // We only care about open positions with valid sizes
            if (!pos.size || pos.size <= 0 || !pos.currentValue)
                continue;
            const entryPrice = pos.avgPrice || 0;
            if (entryPrice <= 0)
                continue;
            // Calculate current price and actual PnL
            // currentValue is the current USD value of the position. size is amount of tokens.
            const curPrice = pos.currentValue / pos.size;
            // Percentage change
            const pnlPercent = ((curPrice - entryPrice) / entryPrice) * 100;
            let triggerAction = false;
            let reasonLabel = '';
            // Check Take Profit
            if (tpPercent > 0 && pnlPercent >= tpPercent) {
                triggerAction = true;
                reasonLabel = `TAKE-PROFIT atingido (+${pnlPercent.toFixed(1)}% >= ${tpPercent}%)`;
            }
            // Check Stop Loss
            if (slPercent < 0 && pnlPercent <= slPercent) {
                triggerAction = true;
                reasonLabel = `STOP-LOSS atingido (${pnlPercent.toFixed(1)}% <= ${slPercent}%)`;
            }
            if (triggerAction) {
                Logger.warning(`[${user.chatId || address.slice(0, 6)}] 🎯 RISK TRIGGER: ${reasonLabel} for ${pos.asset} (title: ${pos.title})`);
                yield executeEmergencySell(user, pos, reasonLabel);
            }
        }
    }
    catch (e) {
        Logger.error(`Error processing risk for user ${address}: ${e}`);
    }
});
const executeEmergencySell = (user, position, reason) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const clobClient = yield createClobClient(user.wallet.privateKey);
        // Find best bid to ensure execution
        const orderBook = yield clobClient.getOrderBook(position.asset);
        if (!orderBook.bids || orderBook.bids.length === 0) {
            Logger.warning(`[${user.chatId}] No bids available to sell/close position ${position.asset}`);
            return;
        }
        // We want to sell immediately, so we find the highest bid
        const maxPriceBid = orderBook.bids.reduce((max, bid) => {
            return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
        }, orderBook.bids[0]);
        const tokenSize = parseFloat(position.size);
        const sellAmount = Math.min(tokenSize, parseFloat(maxPriceBid.size));
        if (sellAmount < 1) {
            return;
        }
        const order_arges = {
            side: Side.SELL,
            tokenID: position.asset,
            amount: sellAmount,
            price: parseFloat(maxPriceBid.price),
        };
        const signedOrder = yield clobClient.createMarketOrder(order_arges);
        const resp = yield clobClient.postOrder(signedOrder, OrderType.FOK);
        if (resp.success === true) {
            Logger.orderResult(true, `[${user.chatId}] Closed ${sellAmount} tokens due to ${reason}`);
            telegram.tpSlTriggered(user.chatId, `Fechado ${sellAmount.toFixed(2)} tokens.\nMotivo: ${reason}\nMercado: ${position.title || position.asset}`);
        }
        else {
            Logger.error(`[${user.chatId}] Failed to sell via TP/SL trigger: ${JSON.stringify(resp)}`);
        }
    }
    catch (error) {
        Logger.error(`[${user.chatId}] Exception in emergency sell: ${error}`);
    }
});
