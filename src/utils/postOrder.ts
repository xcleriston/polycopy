import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { ENV } from '../config/env.js';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User.js';
import { Activity, getUserActivityModel } from '../models/userHistory.js';
import Logger from './logger.js';
import { calculateOrderSize, getTradeMultiplier, CopyStrategy, CopyStrategyConfig } from '../config/copyStrategy.js';

const SLIPPAGE_TOLERANCE = parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.05');

// Polymarket minimum order sizes
const MIN_ORDER_SIZE_USD = 1.0;
const MIN_ORDER_SIZE_TOKENS = 1.0;

const extractOrderError = (response: unknown): string | undefined => {
    if (!response) return undefined;
    if (typeof response === 'string') return response;
    if (typeof response === 'object') {
        const data = response as Record<string, unknown>;
        const directError = data.error;
        if (typeof directError === 'string') return directError;
        if (typeof data.errorMsg === 'string') return data.errorMsg;
        if (typeof data.message === 'string') return data.message;
    }
    return undefined;
};

const isInsufficientBalanceOrAllowanceError = (message: string | undefined): boolean => {
    if (!message) return false;
    const lower = message.toLowerCase();
    return lower.includes('not enough balance') || lower.includes('allowance');
};

const postOrder = async (
    clobClient: ClobClient,
    condition: string,
    my_position: UserPositionInterface | undefined,
    user_position: UserPositionInterface | undefined,
    trade: UserActivityInterface,
    my_balance: number,
    followerId: string,
    userConfig: any 
) => {
    // Create a complete strategy config using defaults + user overrides
    const config = {
        strategy: (userConfig.strategy as CopyStrategy) || CopyStrategy.PERCENTAGE,
        copySize: userConfig.copySize || 10.0,
        maxOrderSizeUSD: parseFloat(process.env.MAX_ORDER_SIZE_USD || '100'),
        minOrderSizeUSD: 1.0,
        tradeMultiplier: 1.0,
        ...userConfig
    };

    // 1. Pre-execution Filters
    const tradePrice = trade.price;
    const tradeSizeUSD = trade.usdcSize;

    // Side filter
    if (condition === 'buy' && config.copyBuy === false) {
        Logger.info(`[${followerId}] 🚫 Skipped: CopyBuy is OFF`);
        return;
    }
    if (condition === 'sell' && config.copySell === false) {
        Logger.info(`[${followerId}] 🚫 Skipped: CopySell is OFF`);
        return;
    }

    // Price filter
    if (config.minPrice > 0 && tradePrice < config.minPrice) {
        Logger.info(`[${followerId}] 🚫 Skipped: Price $${tradePrice} below min $${config.minPrice}`);
        return;
    }
    if (config.maxPrice > 0 && tradePrice > config.maxPrice) {
        Logger.info(`[${followerId}] 🚫 Skipped: Price $${tradePrice} above max $${config.maxPrice}`);
        return;
    }

    // Trade size filter
    if (config.minTradeSize > 0 && tradeSizeUSD < config.minTradeSize) {
        Logger.info(`[${followerId}] 🚫 Skipped: Trade size $${tradeSizeUSD} below min $${config.minTradeSize}`);
        return;
    }
    if (config.maxTradeSize > 0 && tradeSizeUSD > config.maxTradeSize) {
        Logger.info(`[${followerId}] 🚫 Skipped: Trade size $${tradeSizeUSD} above max $${config.maxTradeSize}`);
        return;
    }

    // 2. Reverse Copy Logic
    let effectiveCondition = condition;
    if (config.reverseCopy === true) {
        effectiveCondition = condition === 'buy' ? 'sell' : 'buy';
        Logger.info(`[${followerId}] 🔄 REVERSE COPY: Flipping ${condition.toUpperCase()} to ${effectiveCondition.toUpperCase()}`);
    }

    const slippage = config.slippage || SLIPPAGE_TOLERANCE;
    const retryLimit = parseInt(process.env.RETRY_LIMIT || '3');

    if (effectiveCondition === 'buy') {
        Logger.info(`[${followerId}] Executing BUY strategy...`);

        // Get current position size 
        const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;

        const orderCalc = calculateOrderSize(
            config,
            trade.usdcSize,
            my_balance,
            currentPositionValue
        );

        Logger.info(`[${followerId}] 📊 ${orderCalc.reasoning}`);

        if (orderCalc.finalAmount === 0) {
            Logger.warning(`[${followerId}] ❌ Cannot execute: ${orderCalc.reasoning}`);
            return;
        }

        let remaining = orderCalc.finalAmount;
        let retry = 0;
        let totalBoughtTokens = 0;

        while (remaining > 0 && retry < retryLimit) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            if (!orderBook.asks || orderBook.asks.length === 0) {
                Logger.warning(`[${followerId}] No asks available`);
                break;
            }

            const minPriceAsk = orderBook.asks.reduce((min: any, ask: any) => {
                return parseFloat(ask.price) < parseFloat(min.price) ? ask : min;
            }, orderBook.asks[0]);

            if (parseFloat(minPriceAsk.price) - slippage > trade.price) {
                Logger.warning(`[${followerId}] Price slippage too high ($${minPriceAsk.price} vs target $${trade.price}) - skipping trade`);
                break;
            }

            if (remaining < MIN_ORDER_SIZE_USD) break;

            const maxOrderSize = parseFloat(minPriceAsk.size) * parseFloat(minPriceAsk.price);
            const orderSize = Math.min(remaining, maxOrderSize);

            const order_arges = {
                side: Side.BUY,
                tokenID: trade.asset,
                amount: orderSize,
                price: parseFloat(minPriceAsk.price),
            };

            const signedOrder = await clobClient.createMarketOrder(order_arges);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
            
            if (resp.success === true) {
                retry = 0;
                const tokensBought = order_arges.amount / order_arges.price;
                totalBoughtTokens += tokensBought;
                Logger.orderResult(true, `[${followerId}] Bought $${order_arges.amount.toFixed(2)}`);
                remaining -= order_arges.amount;
            } else {
                const errorMessage = extractOrderError(resp);
                if (isInsufficientBalanceOrAllowanceError(errorMessage)) break;
                retry += 1;
                Logger.warning(`[${followerId}] Order failed (${retry}/${retryLimit})`);
            }
        }
        
        // Update specific meta-fields for THIS follower's execution if needed
        // Since we share the same activity record, we can't save myBoughtSize there easily for multiple followers
        // TODO: Consider a separate Execution model for better tracking
    } else if (effectiveCondition === 'sell') {
        Logger.info(`[${followerId}] Executing SELL strategy...`);
        if (!my_position) {
            Logger.warning(`[${followerId}] No position to sell`);
            return;
        }

        // Simpler sell logic for multi-user: proportional sell based on position size
        let trader_sell_percent = 1.0;
        if (user_position) {
            trader_sell_percent = trade.size / (user_position.size + trade.size);
        }
        
        let remaining = my_position.size * trader_sell_percent;

        if (remaining < MIN_ORDER_SIZE_TOKENS) {
            Logger.warning(`[${followerId}] Sell amount too small`);
            return;
        }

        let retry = 0;
        let totalSoldTokens = 0;

        while (remaining > 0 && retry < retryLimit) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            if (!orderBook.bids || orderBook.bids.length === 0) break;

            const maxPriceBid = orderBook.bids.reduce((max: any, bid: any) => {
                return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
            }, orderBook.bids[0]);

            const sellAmount = Math.min(remaining, parseFloat(maxPriceBid.size));
            if (sellAmount < MIN_ORDER_SIZE_TOKENS) break;

            const order_arges = {
                side: Side.SELL,
                tokenID: trade.asset,
                amount: sellAmount,
                price: parseFloat(maxPriceBid.price),
            };
            
            const signedOrder = await clobClient.createMarketOrder(order_arges);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                totalSoldTokens += order_arges.amount;
                Logger.orderResult(true, `[${followerId}] Sold ${order_arges.amount} tokens`);
                remaining -= order_arges.amount;
            } else {
                retry += 1;
            }
        }
    }
};

export default postOrder;
