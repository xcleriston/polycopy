var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { Side, OrderType } from "@polymarket/clob-client";
import User from "../models/user.js";
import { Activity } from "../models/userHistory.js";
import Logger from "./logger.js";
import telegram from "./telegram.js";
import { calculateOrderSize } from "../config/copyStrategy.js";
const extractOrderError = (resp) => {
    if (resp.error)
        return resp.error;
    if (typeof resp === 'string')
        return resp;
    if (resp.message)
        return resp.message;
    return JSON.stringify(resp);
};
export const recordStatus = (activityId, followerId, status, details, extra) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const _a = extra || {}, { processed, myEntryPrice, myEntryAmount } = _a, restExtra = __rest(_a, ["processed", "myEntryPrice", "myEntryAmount"]);
        // Redundant fields for dashboard compatibility
        const dashboardData = Object.assign({ status,
            details, timestamp: new Date(), 
            // Price fields
            price: myEntryPrice, myEntryPrice: myEntryPrice, entryPrice: myEntryPrice, executedPrice: myEntryPrice, 
            // Amount fields
            amount: myEntryAmount, myEntryAmount: myEntryAmount, value: myEntryAmount, 
            // Profit fields (initial placeholder or calculated)
            pnl: (extra === null || extra === void 0 ? void 0 : extra.pnl) || 0, profit: (extra === null || extra === void 0 ? void 0 : extra.profit) || 0, percentPnl: (extra === null || extra === void 0 ? void 0 : extra.percentPnl) || 0 }, restExtra);
        const updateData = {
            [`followerStatuses.${followerId}`]: dashboardData
        };
        const updateQuery = { $set: updateData };
        if (processed) {
            updateQuery.$addToSet = { processedBy: followerId };
        }
        yield Activity.updateOne({ _id: activityId }, updateQuery);
        Logger.info(`[STATUS] Recorded "${status}" for ${followerId} with full metadata`);
    }
    catch (e) {
        Logger.error(`Failed to record status: ${e}`);
    }
});
export const postOrder = (clobClient_1, effectiveCondition_1, my_position_1, user_position_1, trade_1, my_balance_1, followerId_1, config_1, my_positions_1, proxyAddress_1, ...args_1) => __awaiter(void 0, [clobClient_1, effectiveCondition_1, my_position_1, user_position_1, trade_1, my_balance_1, followerId_1, config_1, my_positions_1, proxyAddress_1, ...args_1], void 0, function* (clobClient, effectiveCondition, my_position, user_position, trade, my_balance, followerId, config, my_positions, proxyAddress, retryLimit = 3) {
    try {
        const isMirror100 = config.mode === 'MIRROR_100' || config.bypassFilters;
        if (effectiveCondition === 'buy') {
            Logger.info(`[${followerId}] [EXECUTION] Mode: ${isMirror100 ? 'MIRROR (No Filters)' : 'NORMAL'}`);
            const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;
            const orderCalc = calculateOrderSize(config, trade.usdcSize, my_balance, currentPositionValue);
            let orderSize = orderCalc.finalAmount;
            // ABSOLUTE BYPASS FOR MIRROR MODE
            if (!isMirror100 && orderSize <= 0) {
                yield recordStatus(trade._id, followerId, 'PULADO (ESTRATÉGIA)', orderCalc.reasoning);
                return { success: false, error: orderCalc.reasoning };
            }
            else if (isMirror100) {
                orderSize = trade.usdcSize; // Force exact trader size
            }
            const orderBook = yield clobClient.getOrderBook(trade.asset);
            const asks = orderBook.asks || [];
            if (asks.length === 0) {
                const err = 'Sem ofertas de venda (asks) no book';
                yield recordStatus(trade._id, followerId, 'FALHA (LIQUIDEZ)', err);
                return { success: false, error: err };
            }
            const minPriceAsk = asks.reduce((min, ask) => parseFloat(ask.price) < parseFloat(min.price) ? ask : min, asks[0]);
            const executionPrice = parseFloat(minPriceAsk.price);
            const order_args = {
                side: Side.BUY,
                tokenID: trade.asset,
                amount: orderSize,
                price: executionPrice,
            };
            if (proxyAddress) {
                order_args.maker = proxyAddress;
                order_args.signatureType = 2;
            }
            // In MIRROR mode, we always try Market if size > 1, else Limit
            const isLimit = orderSize < 1.0;
            const signedOrder = isLimit
                ? yield clobClient.createOrder(order_args)
                : yield clobClient.createMarketOrder(order_args);
            Logger.info(`[${followerId}] [SENDING] $${orderSize} @ ${executionPrice} to Polymarket...`);
            const resp = yield clobClient.postOrder(signedOrder, isLimit ? OrderType.GTC : OrderType.FOK);
            if (resp.success) {
                Logger.info(`[${followerId}] [API-RESPONSE] SUCCESS! OrderID: ${resp.orderID}`);
                yield User.updateOne({ _id: followerId }, { $inc: { totalSpentUSD: orderSize } });
                telegram.tradeExecuted(followerId, 'BUY', orderSize, executionPrice, trade.slug || trade.title);
                return {
                    success: true,
                    amount: orderSize,
                    price: executionPrice
                };
            }
            else {
                const err = extractOrderError(resp);
                Logger.error(`[${followerId}] [API-RESPONSE] REJECTED: ${err}`);
                yield recordStatus(trade._id, followerId, 'FALHA (EXCHANGE)', err);
                return { success: false, error: err };
            }
        }
        else if (effectiveCondition === 'sell') {
            // Sell logic simplified to mirror trader's action directly
            if (!my_position) {
                yield recordStatus(trade._id, followerId, 'PULADO (SEM POSIÇÃO)', 'Você não possui posição aberta neste mercado para vender.');
                return { success: false, error: 'Sem posição para vender' };
            }
            let trader_sell_percent = 1.0;
            if (user_position && user_position.size > 0) {
                trader_sell_percent = Math.min(1.0, trade.size / user_position.size);
            }
            let sellTokens = my_position.size * trader_sell_percent;
            const orderBook = yield clobClient.getOrderBook(trade.asset);
            const bids = orderBook.bids || [];
            if (bids.length === 0)
                return { success: false, error: 'Sem bids' };
            const maxPriceBid = bids.reduce((max, bid) => parseFloat(bid.price) > parseFloat(max.price) ? bid : max, bids[0]);
            const order_args = {
                side: Side.SELL,
                tokenID: trade.asset,
                amount: sellTokens,
                price: parseFloat(maxPriceBid.price),
            };
            if (proxyAddress) {
                order_args.maker = proxyAddress;
                order_args.signatureType = 2;
            }
            const signedOrder = yield clobClient.createOrder(order_args);
            const resp = yield clobClient.postOrder(signedOrder, OrderType.GTC);
            if (resp.success) {
                telegram.tradeExecuted(followerId, 'SELL', sellTokens * order_args.price, order_args.price, trade.slug || trade.title);
                return {
                    success: true,
                    amount: sellTokens * order_args.price,
                    price: order_args.price
                };
            }
            else {
                const err = extractOrderError(resp);
                yield recordStatus(trade._id, followerId, 'FALHA (EXCHANGE)', err);
                return { success: false, error: err };
            }
        }
        return { success: false, error: 'Fluxo incompleto' };
    }
    catch (error) {
        Logger.error(`[${followerId}] [CRITICAL] ${error.message}`);
        return { success: false, error: error.message };
    }
});
export default postOrder;
