import { Side, OrderType } from "@polymarket/clob-client";
import User from "../models/user.js";
import { Activity } from "../models/userHistory.js";
import Logger from "./logger.js";
import telegram from "./telegram.js";
import { calculateOrderSize } from "../config/copyStrategy.js";

const extractOrderError = (resp: any): string => {
    if (resp.error) return resp.error;
    if (typeof resp === 'string') return resp;
    if (resp.message) return resp.message;
    return JSON.stringify(resp);
};

export const recordStatus = async (activityId: string, followerId: string, status: string, details?: string, extra?: Record<string, any>) => {
    try {
        const { processed, myEntryPrice, myEntryAmount, ...restExtra } = extra || {};
        
        // Redundant fields for dashboard compatibility
        const dashboardData = {
            status,
            details,
            timestamp: new Date(),
            // Price fields
            price: myEntryPrice,
            myEntryPrice: myEntryPrice,
            entryPrice: myEntryPrice,
            executedPrice: myEntryPrice,
            // Amount fields
            amount: myEntryAmount,
            myEntryAmount: myEntryAmount,
            value: myEntryAmount,
            // Profit fields (initial placeholder or calculated)
            pnl: extra?.pnl || 0,
            profit: extra?.profit || 0,
            percentPnl: extra?.percentPnl || 0,
            ...restExtra
        };

        const updateData: any = {
            [`followerStatuses.${followerId}`]: dashboardData
        };
        const updateQuery: any = { $set: updateData };
        if (processed) {
            updateQuery.$addToSet = { processedBy: followerId };
        }
        await Activity.updateOne({ _id: activityId }, updateQuery);
        Logger.info(`[STATUS] Recorded "${status}" for ${followerId} with full metadata`);
    } catch (e) {
        Logger.error(`Failed to record status: ${e}`);
    }
};

export const postOrder = async (
    clobClient: any,
    effectiveCondition: 'buy' | 'sell',
    my_position: any,
    user_position: any,
    trade: any,
    my_balance: number,
    followerId: string,
    config: any,
    my_positions: any[],
    proxyAddress?: string,
    retryLimit: number = 3
) => {
    try {
        const isMirror100 = config.mode === 'MIRROR_100' || config.bypassFilters;
        
        if (effectiveCondition === 'buy') {
            Logger.info(`[${followerId}] [EXECUTION] Mode: ${isMirror100 ? 'MIRROR (No Filters)' : 'NORMAL'}`);
            
            const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;
            const orderCalc = calculateOrderSize(config, trade.usdcSize, my_balance, currentPositionValue);
            
            let orderSize = orderCalc.finalAmount;

            // ABSOLUTE BYPASS FOR MIRROR MODE
            if (!isMirror100 && orderSize <= 0) {
                await recordStatus(trade._id, followerId, 'PULADO', orderCalc.reasoning);
                return { success: false, error: orderCalc.reasoning };
            } else if (isMirror100) {
                orderSize = trade.usdcSize; // Force exact trader size
            }

            const orderBook = await clobClient.getOrderBook(trade.asset);
            const asks = orderBook.asks || [];
            if (asks.length === 0) {
                const err = 'Sem ofertas de venda (asks) no book';
                await recordStatus(trade._id, followerId, 'FALHA (LIQUIDEZ)', err);
                return { success: false, error: err };
            }

            const minPriceAsk = asks.reduce((min: any, ask: any) => parseFloat(ask.price) < parseFloat(min.price) ? ask : min, asks[0]);
            const executionPrice = parseFloat(minPriceAsk.price);

            const order_args: any = {
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
                ? await clobClient.createOrder(order_args)
                : await clobClient.createMarketOrder(order_args);
                
            Logger.info(`[${followerId}] [SENDING] $${orderSize} @ ${executionPrice} to Polymarket...`);
            const resp = await clobClient.postOrder(signedOrder, isLimit ? OrderType.GTC : OrderType.FOK);
            
            if (resp.success) {
                Logger.info(`[${followerId}] [API-RESPONSE] SUCCESS! OrderID: ${resp.orderID}`);
                await User.updateOne({ _id: followerId }, { $inc: { totalSpentUSD: orderSize } });
                telegram.tradeExecuted(followerId, 'BUY', orderSize, executionPrice, trade.slug || trade.title);
                
                return {
                    success: true,
                    amount: orderSize,
                    price: executionPrice
                };
            } else {
                const err = extractOrderError(resp);
                Logger.error(`[${followerId}] [API-RESPONSE] REJECTED: ${err}`);
                await recordStatus(trade._id, followerId, 'FALHA (EXCHANGE)', err);
                return { success: false, error: err };
            }
        } else if (effectiveCondition === 'sell') {
            // Sell logic simplified to mirror trader's action directly
            if (!my_position) return { success: false, error: 'Sem posição para vender' };

            let trader_sell_percent = 1.0;
            if (user_position && user_position.size > 0) {
                trader_sell_percent = Math.min(1.0, trade.size / user_position.size);
            }
            
            let sellTokens = my_position.size * trader_sell_percent;
            const orderBook = await clobClient.getOrderBook(trade.asset);
            const bids = orderBook.bids || [];
            if (bids.length === 0) return { success: false, error: 'Sem bids' };

            const maxPriceBid = bids.reduce((max: any, bid: any) => parseFloat(bid.price) > parseFloat(max.price) ? bid : max, bids[0]);
            
            const order_args: any = {
                side: Side.SELL,
                tokenID: trade.asset,
                amount: sellTokens,
                price: parseFloat(maxPriceBid.price),
            };

            if (proxyAddress) {
                order_args.maker = proxyAddress;
                order_args.signatureType = 2;
            }

            const signedOrder = await clobClient.createOrder(order_args);
            const resp = await clobClient.postOrder(signedOrder, OrderType.GTC);
            
            if (resp.success) {
                telegram.tradeExecuted(followerId, 'SELL', sellTokens * order_args.price, order_args.price, trade.slug || trade.title);
                return {
                    success: true,
                    amount: sellTokens * order_args.price,
                    price: order_args.price
                };
            } else {
                const err = extractOrderError(resp);
                await recordStatus(trade._id, followerId, 'FALHA (EXCHANGE)', err);
                return { success: false, error: err };
            }
        }
        return { success: false, error: 'Fluxo incompleto' };
    } catch (error: any) {
        Logger.error(`[${followerId}] [CRITICAL] ${error.message}`);
        return { success: false, error: error.message };
    }
};

export default postOrder;
