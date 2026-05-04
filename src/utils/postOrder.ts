import { Side, OrderType } from "@polymarket/clob-sdk";
import { User } from "../models/user.js";
import { Activity } from "../models/userHistory.js";
import Logger from "./logger.js";
import telegram from "./telegram.js";
import { calculateOrderSize } from "../config/copyStrategy.js";

const MIN_ORDER_SIZE_USD = 1.0;
const MIN_ORDER_SIZE_TOKENS = 0.1;

const extractOrderError = (resp: any): string => {
    if (resp.error) return resp.error;
    if (typeof resp === 'string') return resp;
    return JSON.stringify(resp);
};

const isInsufficientBalanceOrAllowanceError = (message: string | undefined): boolean => {
    if (!message) return false;
    const msg = message.toLowerCase();
    return msg.includes("insufficient balance") || 
           msg.includes("insufficient allowance") || 
           msg.includes("not enough usdc");
};

export const recordStatus = async (activityId: string, followerId: string, status: string, details?: string, extra?: Record<string, any>) => {
    try {
        const { processed, ...restExtra } = extra || {};
        const updateData: any = {
            [`followerStatuses.${followerId}`]: { 
                status, 
                details, 
                timestamp: new Date(), 
                ...restExtra 
            }
        };
        const updateQuery: any = { $set: updateData };
        if (processed) {
            updateQuery.$addToSet = { processedBy: followerId };
        }
        await Activity.updateOne({ _id: activityId }, updateQuery);
        Logger.info(`[STATUS] Recorded "${status}" for follower ${followerId} (processed: ${!!processed})`);
    } catch (e) {
        Logger.error(`Failed to record status for ${followerId}: ${e}`);
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
        const isMirror100 = config.mode === 'MIRROR_100';
        
        if (effectiveCondition === 'buy') {
            Logger.info(`[${followerId}] Executing BUY strategy...`);
            
            const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;
            const orderCalc = calculateOrderSize(config, trade.usdcSize, my_balance, currentPositionValue);
            
            Logger.info(`[${followerId}] 📊 ${orderCalc.reasoning}`);

            if (orderCalc.finalAmount <= 0) {
                await recordStatus(trade._id, followerId, 'PULADO', orderCalc.reasoning);
                return { success: false, error: orderCalc.reasoning };
            }

            let remaining = orderCalc.finalAmount;
            let retry = 0;

            while (remaining > 0.90 && retry < retryLimit) {
                const orderBook = await clobClient.getOrderBook(trade.asset);
                const asks = orderBook.asks || [];
                if (asks.length === 0) {
                    await recordStatus(trade._id, followerId, 'PULADO (LIQUIDEZ)', 'Sem asks no book');
                    break;
                }

                const minPriceAsk = asks.reduce((min: any, ask: any) => parseFloat(ask.price) < parseFloat(min.price) ? ask : min, asks[0]);
                
                // Slippage check (except in MIRROR_100)
                if (!isMirror100 && parseFloat(minPriceAsk.price) - 0.05 > trade.price) {
                    await recordStatus(trade._id, followerId, 'PULADO (SLIPPAGE)', `Preço ${minPriceAsk.price} muito alto vs ${trade.price}`);
                    break;
                }

                const orderSize = Math.min(remaining, parseFloat(minPriceAsk.size) * parseFloat(minPriceAsk.price));
                if (orderSize < 0.90) break;

                const order_args: any = {
                    side: Side.BUY,
                    tokenID: trade.asset,
                    amount: orderSize,
                    price: parseFloat(minPriceAsk.price),
                };

                if (proxyAddress) {
                    order_args.maker = proxyAddress;
                    order_args.signatureType = 2;
                }

                const isLimit = (trade as any).orderType === 'LIMIT' || orderSize < 1.0;
                const signedOrder = isLimit 
                    ? await clobClient.createOrder(order_args)
                    : await clobClient.createMarketOrder(order_args);
                    
                const resp = await clobClient.postOrder(signedOrder, isLimit ? OrderType.GTC : OrderType.FOK);
                
                if (resp.success) {
                    await User.updateOne({ _id: followerId }, { $inc: { totalSpentUSD: orderSize } });
                    Logger.orderResult(true, `[${followerId}] Bought $${orderSize.toFixed(2)}`);
                    telegram.tradeExecuted(followerId, 'BUY', orderSize, order_args.price, trade.slug || trade.title);
                    
                    return {
                        success: true,
                        amount: orderSize,
                        price: order_args.price
                    };
                } else {
                    const err = extractOrderError(resp);
                    if (isInsufficientBalanceOrAllowanceError(err)) {
                        await recordStatus(trade._id, followerId, 'ERRO (SALDO)', err);
                        return { success: false, error: err };
                    }
                    retry++;
                    if (retry >= retryLimit) {
                        await recordStatus(trade._id, followerId, 'ERRO (API)', err);
                        return { success: false, error: err };
                    }
                }
            }
        } else if (effectiveCondition === 'sell') {
            Logger.info(`[${followerId}] Executing SELL strategy...`);
            if (!my_position) return { success: false, error: 'Sem posição para vender' };

            let trader_sell_percent = 1.0;
            if (user_position) {
                trader_sell_percent = trade.size / (user_position.size + trade.size);
            }
            let remaining = my_position.size * trader_sell_percent;
            if (remaining < MIN_ORDER_SIZE_TOKENS) return { success: false, error: 'Quantidade insuficiente' };

            const orderBook = await clobClient.getOrderBook(trade.asset);
            const bids = orderBook.bids || [];
            if (bids.length === 0) {
                await recordStatus(trade._id, followerId, 'PULADO (LIQUIDEZ)', 'Sem bids no book');
                return { success: false, error: 'Sem liquidez' };
            }

            const maxPriceBid = bids.reduce((max: any, bid: any) => parseFloat(bid.price) > parseFloat(max.price) ? bid : max, bids[0]);
            const sellAmount = Math.min(remaining, parseFloat(maxPriceBid.size));
            if (sellAmount < MIN_ORDER_SIZE_TOKENS) return { success: false, error: 'Abaixo do mínimo' };

            const order_args: any = {
                side: Side.SELL,
                tokenID: trade.asset,
                amount: sellAmount,
                price: parseFloat(maxPriceBid.price),
            };

            if (proxyAddress) {
                order_args.maker = proxyAddress;
                order_args.signatureType = 2;
            }

            const isLimit = (trade as any).orderType === 'LIMIT' || (sellAmount * order_args.price) < 1.0;
            const signedOrder = isLimit 
                ? await clobClient.createOrder(order_args)
                : await clobClient.createMarketOrder(order_args);
                
            const resp = await clobClient.postOrder(signedOrder, isLimit ? OrderType.GTC : OrderType.FOK);
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
    } catch (error: any) {
        Logger.error(`[${followerId}] CRITICAL: ${error.message}`);
        return { success: false, error: error.message };
    }
};

export default postOrder;
