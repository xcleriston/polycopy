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
import { Side, OrderType } from "@polymarket/clob-sdk";
import { User } from "../models/user.js";
import { Activity } from "../models/userHistory.js";
import Logger from "./logger.js";
import telegram from "./telegram.js";
import { calculateOrderSize } from "../config/copyStrategy.js";
const MIN_ORDER_SIZE_USD = 1.0;
const MIN_ORDER_SIZE_TOKENS = 0.1;
const extractOrderError = (resp) => {
    if (resp.error)
        return resp.error;
    if (typeof resp === 'string')
        return resp;
    return JSON.stringify(resp);
};
const isInsufficientBalanceOrAllowanceError = (message) => {
    if (!message)
        return false;
    const msg = message.toLowerCase();
    return msg.includes("insufficient balance") ||
        msg.includes("insufficient allowance") ||
        msg.includes("not enough usdc");
};
export const recordStatus = (activityId, followerId, status, details, extra) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const _a = extra || {}, { processed } = _a, restExtra = __rest(_a, ["processed"]);
        const updateData = {
            [`followerStatuses.${followerId}`]: Object.assign({ status,
                details, timestamp: new Date() }, restExtra)
        };
        const updateQuery = { $set: updateData };
        if (processed) {
            updateQuery.$addToSet = { processedBy: followerId };
        }
        yield Activity.updateOne({ _id: activityId }, updateQuery);
        Logger.info(`[STATUS] Recorded "${status}" for follower ${followerId} (processed: ${!!processed})`);
    }
    catch (e) {
        Logger.error(`Failed to record status for ${followerId}: ${e}`);
    }
});
export const postOrder = (clobClient_1, effectiveCondition_1, my_position_1, user_position_1, trade_1, my_balance_1, followerId_1, config_1, my_positions_1, proxyAddress_1, ...args_1) => __awaiter(void 0, [clobClient_1, effectiveCondition_1, my_position_1, user_position_1, trade_1, my_balance_1, followerId_1, config_1, my_positions_1, proxyAddress_1, ...args_1], void 0, function* (clobClient, effectiveCondition, my_position, user_position, trade, my_balance, followerId, config, my_positions, proxyAddress, retryLimit = 3) {
    try {
        const isMirror100 = config.mode === 'MIRROR_100';
        if (effectiveCondition === 'buy') {
            Logger.info(`[${followerId}] Executing BUY strategy...`);
            const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;
            const orderCalc = calculateOrderSize(config, trade.usdcSize, my_balance, currentPositionValue);
            Logger.info(`[${followerId}] 📊 ${orderCalc.reasoning}`);
            if (orderCalc.finalAmount <= 0) {
                yield recordStatus(trade._id, followerId, 'PULADO', orderCalc.reasoning);
                return { success: false, error: orderCalc.reasoning };
            }
            let remaining = orderCalc.finalAmount;
            let retry = 0;
            while (remaining > 0.90 && retry < retryLimit) {
                const orderBook = yield clobClient.getOrderBook(trade.asset);
                const asks = orderBook.asks || [];
                if (asks.length === 0) {
                    yield recordStatus(trade._id, followerId, 'PULADO (LIQUIDEZ)', 'Sem asks no book');
                    break;
                }
                const minPriceAsk = asks.reduce((min, ask) => parseFloat(ask.price) < parseFloat(min.price) ? ask : min, asks[0]);
                // Slippage check (except in MIRROR_100)
                if (!isMirror100 && parseFloat(minPriceAsk.price) - 0.05 > trade.price) {
                    yield recordStatus(trade._id, followerId, 'PULADO (SLIPPAGE)', `Preço ${minPriceAsk.price} muito alto vs ${trade.price}`);
                    break;
                }
                const orderSize = Math.min(remaining, parseFloat(minPriceAsk.size) * parseFloat(minPriceAsk.price));
                if (orderSize < 0.90)
                    break;
                const order_args = {
                    side: Side.BUY,
                    tokenID: trade.asset,
                    amount: orderSize,
                    price: parseFloat(minPriceAsk.price),
                };
                if (proxyAddress) {
                    order_args.maker = proxyAddress;
                    order_args.signatureType = 2;
                }
                const isLimit = trade.orderType === 'LIMIT' || orderSize < 1.0;
                const signedOrder = isLimit
                    ? yield clobClient.createOrder(order_args)
                    : yield clobClient.createMarketOrder(order_args);
                const resp = yield clobClient.postOrder(signedOrder, isLimit ? OrderType.GTC : OrderType.FOK);
                if (resp.success) {
                    yield User.updateOne({ _id: followerId }, { $inc: { totalSpentUSD: orderSize } });
                    Logger.orderResult(true, `[${followerId}] Bought $${orderSize.toFixed(2)}`);
                    telegram.tradeExecuted(followerId, 'BUY', orderSize, order_args.price, trade.slug || trade.title);
                    return {
                        success: true,
                        amount: orderSize,
                        price: order_args.price
                    };
                }
                else {
                    const err = extractOrderError(resp);
                    if (isInsufficientBalanceOrAllowanceError(err)) {
                        yield recordStatus(trade._id, followerId, 'ERRO (SALDO)', err);
                        return { success: false, error: err };
                    }
                    retry++;
                    if (retry >= retryLimit) {
                        yield recordStatus(trade._id, followerId, 'ERRO (API)', err);
                        return { success: false, error: err };
                    }
                }
            }
        }
        else if (effectiveCondition === 'sell') {
            Logger.info(`[${followerId}] Executing SELL strategy...`);
            if (!my_position)
                return { success: false, error: 'Sem posição para vender' };
            let trader_sell_percent = 1.0;
            if (user_position) {
                trader_sell_percent = trade.size / (user_position.size + trade.size);
            }
            let remaining = my_position.size * trader_sell_percent;
            if (remaining < MIN_ORDER_SIZE_TOKENS)
                return { success: false, error: 'Quantidade insuficiente' };
            const orderBook = yield clobClient.getOrderBook(trade.asset);
            const bids = orderBook.bids || [];
            if (bids.length === 0) {
                yield recordStatus(trade._id, followerId, 'PULADO (LIQUIDEZ)', 'Sem bids no book');
                return { success: false, error: 'Sem liquidez' };
            }
            const maxPriceBid = bids.reduce((max, bid) => parseFloat(bid.price) > parseFloat(max.price) ? bid : max, bids[0]);
            const sellAmount = Math.min(remaining, parseFloat(maxPriceBid.size));
            if (sellAmount < MIN_ORDER_SIZE_TOKENS)
                return { success: false, error: 'Abaixo do mínimo' };
            const order_args = {
                side: Side.SELL,
                tokenID: trade.asset,
                amount: sellAmount,
                price: parseFloat(maxPriceBid.price),
            };
            if (proxyAddress) {
                order_args.maker = proxyAddress;
                order_args.signatureType = 2;
            }
            const isLimit = trade.orderType === 'LIMIT' || (sellAmount * order_args.price) < 1.0;
            const signedOrder = isLimit
                ? yield clobClient.createOrder(order_args)
                : yield clobClient.createMarketOrder(order_args);
            const resp = yield clobClient.postOrder(signedOrder, isLimit ? OrderType.GTC : OrderType.FOK);
            if (resp.success) {
                telegram.tradeExecuted(followerId, 'SELL', sellAmount * order_args.price, order_args.price, trade.slug || trade.title);
                return {
                    success: true,
                    amount: sellAmount * order_args.price,
                    price: order_args.price
                };
            }
        }
        return { success: false, error: 'Fim do fluxo sem execução' };
    }
    catch (error) {
        Logger.error(`[${followerId}] CRITICAL: ${error.message}`);
        return { success: false, error: error.message };
    }
});
export default postOrder;
