var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { OrderType, Side } from '@polymarket/clob-client';
import { Activity } from '../models/userHistory.js';
import User from '../models/user.js';
import Logger from './logger.js';
import { calculateOrderSize, CopyStrategy } from '../config/copyStrategy.js';
import telegram from './telegram.js';
import fetchData from './fetchData.js';
const SLIPPAGE_TOLERANCE = parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.05');
// Polymarket minimum order sizes
const MIN_ORDER_SIZE_USD = 1.0;
const MIN_ORDER_SIZE_TOKENS = 1.0;
const extractOrderError = (response) => {
    if (!response)
        return undefined;
    if (typeof response === 'string')
        return response;
    if (typeof response === 'object') {
        const data = response;
        const directError = data.error;
        if (typeof directError === 'string')
            return directError;
        if (typeof data.errorMsg === 'string')
            return data.errorMsg;
        if (typeof data.message === 'string')
            return data.message;
    }
    return undefined;
};
const isInsufficientBalanceOrAllowanceError = (message) => {
    if (!message)
        return false;
    const lower = message.toLowerCase();
    return lower.includes('not enough balance') || lower.includes('allowance');
};
const recordStatus = (activityId, followerId, status, details, extra) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield Activity.updateOne({ _id: activityId }, { $set: { [`followerStatuses.${followerId}`]: Object.assign({ status, details, timestamp: new Date() }, extra) } });
    }
    catch (e) {
        Logger.error(`Failed to record status for ${followerId}: ${e}`);
    }
});
const postOrder = (clobClient_1, condition_1, my_position_1, user_position_1, trade_1, my_balance_1, followerId_1, userConfig_1, ...args_1) => __awaiter(void 0, [clobClient_1, condition_1, my_position_1, user_position_1, trade_1, my_balance_1, followerId_1, userConfig_1, ...args_1], void 0, function* (clobClient, condition, my_position, user_position, trade, // Use any for raw activity data access
my_balance, followerId, userConfig, my_positions = [], // Optional positions for exposure check
proxyAddress // New argument
) {
    // Force 100% copy if in MIRROR_100 mode
    const isMirror100 = userConfig.mode === 'MIRROR_100';
    const config = Object.assign({ strategy: isMirror100 ? CopyStrategy.PERCENTAGE : (userConfig.strategy || CopyStrategy.PERCENTAGE), copySize: isMirror100 ? 100.0 : (userConfig.copySize || 10.0), maxOrderSizeUSD: parseFloat(process.env.MAX_ORDER_SIZE_USD || '500'), minOrderSizeUSD: isMirror100 ? 0 : 1.0, tradeMultiplier: 1.0, buyAtMin: isMirror100 ? true : !!userConfig.buyAtMin }, userConfig);
    // 1. Pre-execution Filters (Bypassed in MIRROR_100)
    const tradePrice = trade.price;
    const tradeSizeUSD = trade.usdcSize;
    if (!isMirror100) {
        // Side filter
        if (condition === 'buy' && config.copyBuy === false) {
            Logger.info(`[${followerId}] 🚫 Skipped: CopyBuy is OFF`);
            yield recordStatus(trade._id, followerId, 'PULADO (LADO)', 'Compra desativada nas configurações');
            return;
        }
        if (condition === 'sell' && config.copySell === false) {
            Logger.info(`[${followerId}] 🚫 Skipped: CopySell is OFF`);
            yield recordStatus(trade._id, followerId, 'PULADO (LADO)', 'Venda desativada nas configurações');
            return;
        }
        // Price filter
        if (config.minPrice > 0 && tradePrice < config.minPrice) {
            Logger.info(`[${followerId}] 🚫 Skipped: Price $${tradePrice} below min $${config.minPrice}`);
            yield recordStatus(trade._id, followerId, 'PULADO (PREÇO)', `Preço $${tradePrice} abaixo do mínimo $${config.minPrice}`);
            return;
        }
        if (config.maxPrice > 0 && tradePrice > config.maxPrice) {
            Logger.info(`[${followerId}] 🚫 Skipped: Price $${tradePrice} above max $${config.maxPrice}`);
            yield recordStatus(trade._id, followerId, 'PULADO (PREÇO)', `Preço $${tradePrice} acima do máximo $${config.maxPrice}`);
            return;
        }
        // Trade size filter
        if (config.minTradeSize > 0 && tradeSizeUSD < config.minTradeSize) {
            Logger.info(`[${followerId}] 🚫 Skipped: Trade size $${tradeSizeUSD} below min $${config.minTradeSize}`);
            yield recordStatus(trade._id, followerId, 'PULADO (TAMANHO)', `Tamanho $${tradeSizeUSD} abaixo do mínimo $${config.minTradeSize}`);
            return;
        }
        if (config.maxTradeSize > 0 && tradeSizeUSD > config.maxTradeSize) {
            Logger.info(`[${followerId}] 🚫 Skipped: Trade size $${tradeSizeUSD} above max $${config.maxTradeSize}`);
            yield recordStatus(trade._id, followerId, 'PULADO (TAMANHO)', `Tamanho $${tradeSizeUSD} acima do máximo $${config.maxTradeSize}`);
            return;
        }
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
        // Phase 5 Advanced Filters (Bypassed in MIRROR_100)
        if (!isMirror100 && ((config.maxMarketCount && config.maxMarketCount > 0) ||
            (config.sniperModeSec && config.sniperModeSec > 0) ||
            (config.lastMinuteModeSec && config.lastMinuteModeSec > 0) ||
            (config.minMarketLiquidity && config.minMarketLiquidity > 0))) {
            // 1. Max Markets check
            if (config.maxMarketCount > 0) {
                const uniqueConditionIds = new Set(my_positions.map(p => p.conditionId));
                if (!uniqueConditionIds.has(trade.conditionId) && uniqueConditionIds.size >= config.maxMarketCount) {
                    const reason = `Limite de Mercados Simultâneos atingido (${uniqueConditionIds.size} >= ${config.maxMarketCount})`;
                    Logger.warning(`[${followerId}] 🚫 Skipped: ${reason}`);
                    yield recordStatus(trade._id, followerId, 'PULADO (FASE 5)', reason);
                    return;
                }
            }
            // 2. Fetch Gamma Market Data for Time & Liquidity
            if (config.sniperModeSec > 0 || config.lastMinuteModeSec > 0 || config.minMarketLiquidity > 0) {
                try {
                    const marketDataArr = yield fetchData(`https://gamma-api.polymarket.com/events?id=${trade.asset || trade.conditionId}`);
                    // Gamma events endpoint uses IDs or we can query markets directly
                    // Fallback to markets if events fails or we just use markets condition_id
                    const marketsArr = yield fetchData(`https://gamma-api.polymarket.com/markets?condition_id=${trade.conditionId}`);
                    if (marketsArr && marketsArr.length > 0) {
                        const metadata = marketsArr[0];
                        // Anti-Scam Liquidity (Volume as Fallback)
                        const liquidity = metadata.liquidityNum || metadata.volume24hr || 0;
                        if (config.minMarketLiquidity > 0 && liquidity < config.minMarketLiquidity) {
                            const reason = `Liquidez/Volume ($${liquidity.toFixed(0)}) menor que o exigido ($${config.minMarketLiquidity})`;
                            Logger.warning(`[${followerId}] 🚫 Skipped: ${reason}`);
                            yield recordStatus(trade._id, followerId, 'PULADO (ANTI-SCAM)', reason);
                            return;
                        }
                        const nowMs = Date.now();
                        const tradeTime = trade.timestamp > 2000000000 ? trade.timestamp : trade.timestamp * 1000;
                        // Sniper Mode
                        if (config.sniperModeSec > 0 && metadata.startDate) {
                            const startMs = new Date(metadata.startDate).getTime();
                            const diffSec = (tradeTime - startMs) / 1000;
                            if (diffSec > config.sniperModeSec) {
                                const reason = `Sniper Mode: Trade ocorreu ${diffSec.toFixed(0)}s após início (Máx aprovado: ${config.sniperModeSec}s)`;
                                Logger.warning(`[${followerId}] 🚫 Skipped: ${reason}`);
                                yield recordStatus(trade._id, followerId, 'PULADO (SNIPER)', reason);
                                return;
                            }
                        }
                        // Last Minute Mode
                        if (config.lastMinuteModeSec > 0 && metadata.endDate) {
                            const endMs = new Date(metadata.endDate).getTime();
                            const diffSecToClose = (endMs - tradeTime) / 1000;
                            // Notice: endDate on Gamma API might be set far into the future (e.g. 2100) if no known end date exists.
                            if (diffSecToClose > config.lastMinuteModeSec && endMs < 4102444800000) {
                                const reason = `Last Minute Mode: Mercado demorará ${diffSecToClose.toFixed(0)}s para fechar (Mín exigido: ${config.lastMinuteModeSec}s)`;
                                Logger.warning(`[${followerId}] 🚫 Skipped: ${reason}`);
                                yield recordStatus(trade._id, followerId, 'PULADO (LAST MINUTE)', reason);
                                return;
                            }
                        }
                    }
                }
                catch (err) {
                    Logger.warning(`[${followerId}] Falha ao checar Fase 5 Metadata: ${err}`);
                }
            }
        }
        // Get current position size 
        const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;
        const orderCalc = calculateOrderSize(config, trade.usdcSize, my_balance, currentPositionValue);
        Logger.info(`[${followerId}] 📊 ${orderCalc.reasoning}`);
        // Check Buy at Min
        if (config.buyAtMin && orderCalc.finalAmount > 0 && orderCalc.finalAmount < MIN_ORDER_SIZE_USD) {
            orderCalc.finalAmount = MIN_ORDER_SIZE_USD;
            orderCalc.reasoning += ` -> Ajustado para mínimo de $${MIN_ORDER_SIZE_USD} (BuyAtMin ON)`;
        }
        const minOrderCheck = config.mode === 'MIRROR_100' ? 0 : (config.minOrderSizeUSD || 0);
        if (orderCalc.finalAmount < (minOrderCheck - 0.001)) {
            Logger.warning(`[${followerId}] ❌ Cannot execute: ${orderCalc.reasoning}`);
            yield recordStatus(trade._id, followerId, 'PULADO (ESTRATÉGIA)', orderCalc.reasoning);
            return;
        }
        // 3. Exposure and Spend Checks (Bypassed in MIRROR_100)
        if (!isMirror100) {
            const totalExposure = my_positions.reduce((sum, pos) => sum + (pos.currentValue || 0), 0);
            if (config.maxExposure > 0 && (totalExposure + orderCalc.finalAmount) > config.maxExposure) {
                const reason = `Exposição máxima excedida ($${totalExposure.toFixed(2)} + $${orderCalc.finalAmount.toFixed(2)} > $${config.maxExposure})`;
                Logger.warning(`[${followerId}] 🚫 Skipped: ${reason}`);
                yield recordStatus(trade._id, followerId, 'PULADO (EXPOSIÇÃO)', reason);
                return;
            }
            // F1.2 Max Per Market
            const marketExposure = my_positions.filter(p => p.conditionId === trade.conditionId).reduce((sum, pos) => sum + (pos.currentValue || 0), 0);
            if (config.maxPerMarket > 0 && (marketExposure + orderCalc.finalAmount) > config.maxPerMarket) {
                const reason = `Max por Mercado excedido ($${marketExposure.toFixed(2)} + $${orderCalc.finalAmount.toFixed(2)} > $${config.maxPerMarket})`;
                Logger.warning(`[${followerId}] 🚫 Skipped: ${reason}`);
                yield recordStatus(trade._id, followerId, 'PULADO (EXPOSIÇÃO)', reason);
                return;
            }
            // F1.3 Max Per Token
            const tokenExposure = my_positions.filter(p => p.asset === trade.asset).reduce((sum, pos) => sum + (pos.currentValue || 0), 0);
            if (config.maxPerToken > 0 && (tokenExposure + orderCalc.finalAmount) > config.maxPerToken) {
                const reason = `Max por Token excedido ($${tokenExposure.toFixed(2)} + $${orderCalc.finalAmount.toFixed(2)} > $${config.maxPerToken})`;
                Logger.warning(`[${followerId}] 🚫 Skipped: ${reason}`);
                yield recordStatus(trade._id, followerId, 'PULADO (EXPOSIÇÃO)', reason);
                return;
            }
            // F1.5 Total Spend Limit
            const userRec = yield User.findById(followerId);
            const totalSpent = (userRec === null || userRec === void 0 ? void 0 : userRec.totalSpentUSD) || 0;
            if (config.totalSpendLimit > 0 && (totalSpent + orderCalc.finalAmount) > config.totalSpendLimit) {
                const reason = `Limite geral de gasto da conta atingido ($${totalSpent.toFixed(2)} + $${orderCalc.finalAmount.toFixed(2)} > $${config.totalSpendLimit})`;
                Logger.warning(`[${followerId}] 🚫 Skipped: ${reason}`);
                yield recordStatus(trade._id, followerId, 'PULADO (EXPOSIÇÃO)', reason);
                return;
            }
        }
        let remaining = orderCalc.finalAmount;
        let retry = 0;
        let totalBoughtTokens = 0;
        while (remaining > 0 && retry < retryLimit) {
            const orderBook = yield clobClient.getOrderBook(trade.asset);
            if (!orderBook.asks || orderBook.asks.length === 0) {
                Logger.warning(`[${followerId}] No asks available`);
                yield recordStatus(trade._id, followerId, 'PULADO (LIQUIDEZ)', 'Nenhuma oferta de venda (asks) no book');
                break;
            }
            const minPriceAsk = orderBook.asks.reduce((min, ask) => {
                return parseFloat(ask.price) < parseFloat(min.price) ? ask : min;
            }, orderBook.asks[0]);
            if (!isMirror100 && parseFloat(minPriceAsk.price) - slippage > trade.price) {
                const reason = `Slippage muito alto ($${minPriceAsk.price} vs alvo $${trade.price})`;
                Logger.warning(`[${followerId}] ${reason} - skipping trade`);
                yield recordStatus(trade._id, followerId, 'PULADO (SLIPPAGE)', reason);
                break;
            }
            if (remaining < 0.05)
                break; // Dust limit
            const maxOrderSize = parseFloat(minPriceAsk.size) * parseFloat(minPriceAsk.price);
            const orderSize = Math.min(remaining, maxOrderSize);
            const order_arges = {
                side: Side.BUY,
                tokenID: trade.asset,
                amount: orderSize,
                price: parseFloat(minPriceAsk.price),
            };
            // If using a proxy, we MUST specify the proxy as the maker and correct signature type
            if (proxyAddress) {
                order_arges.maker = proxyAddress;
                order_arges.signatureType = 2; // POLY_GNOSIS_SAFE
            }
            const isLimit = trade.orderType === 'LIMIT' || orderSize < 1.0;
            const signedOrder = isLimit
                ? yield clobClient.createOrder(order_arges)
                : yield clobClient.createMarketOrder(order_arges);
            const resp = yield clobClient.postOrder(signedOrder, isLimit ? OrderType.GTC : OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                const tokensBought = order_arges.amount / order_arges.price;
                totalBoughtTokens += tokensBought;
                Logger.orderResult(true, `[${followerId}] Bought $${order_arges.amount.toFixed(2)}`);
                telegram.tradeExecuted(followerId, 'BUY', order_arges.amount, order_arges.price, trade.slug || trade.title || 'Market');
                remaining -= order_arges.amount;
                yield recordStatus(trade._id, followerId, 'SUCESSO', `Comprado $${order_arges.amount.toFixed(2)}`, {
                    myEntryAmount: order_arges.amount,
                    myEntryPrice: order_arges.price,
                    myExecutedAt: new Date(),
                });
                // Update total spent
                yield User.updateOne({ _id: followerId }, { $inc: { totalSpentUSD: order_arges.amount } });
            }
            else {
                const errorMessage = extractOrderError(resp);
                if (isInsufficientBalanceOrAllowanceError(errorMessage)) {
                    yield recordStatus(trade._id, followerId, 'ERRO (SALDO)', errorMessage || 'Saldo ou Allowance insuficiente');
                    break;
                }
                retry += 1;
                Logger.warning(`[${followerId}] Order failed (${retry}/${retryLimit}): ${errorMessage}`);
                if (retry >= retryLimit) {
                    yield recordStatus(trade._id, followerId, 'ERRO (API)', errorMessage || 'Erro ao postar ordem');
                }
            }
        }
        // Update specific meta-fields for THIS follower's execution if needed
        // Since we share the same activity record, we can't save myBoughtSize there easily for multiple followers
        // TODO: Consider a separate Execution model for better tracking
    }
    else if (effectiveCondition === 'sell') {
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
            const orderBook = yield clobClient.getOrderBook(trade.asset);
            if (!orderBook.bids || orderBook.bids.length === 0) {
                Logger.warning(`[${followerId}] No bids available`);
                yield recordStatus(trade._id, followerId, 'PULADO (LIQUIDEZ)', 'Nenhuma oferta de compra (bids) no book');
                break;
            }
            const maxPriceBid = orderBook.bids.reduce((max, bid) => {
                return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
            }, orderBook.bids[0]);
            const sellAmount = Math.min(remaining, parseFloat(maxPriceBid.size));
            if (sellAmount < MIN_ORDER_SIZE_TOKENS)
                break;
            const order_arges = {
                side: Side.SELL,
                tokenID: trade.asset,
                amount: sellAmount,
                price: parseFloat(maxPriceBid.price),
            };
            if (proxyAddress) {
                order_arges.maker = proxyAddress;
                order_arges.signatureType = 2; // POLY_GNOSIS_SAFE
            }
            const isLimit = trade.orderType === 'LIMIT' || order_arges.amount < 1.0;
            const signedOrder = isLimit
                ? yield clobClient.createOrder(order_arges)
                : yield clobClient.createMarketOrder(order_arges);
            const resp = yield clobClient.postOrder(signedOrder, isLimit ? OrderType.GTC : OrderType.FOK);
            if (resp.success === true) {
                retry = 0;
                totalSoldTokens += order_arges.amount;
                Logger.orderResult(true, `[${followerId}] Sold ${order_arges.amount} tokens`);
                telegram.tradeExecuted(followerId, 'SELL', order_arges.amount * order_arges.price, order_arges.price, trade.slug || trade.title || 'Market');
                remaining -= order_arges.amount;
            }
            else {
                retry += 1;
            }
        }
    }
});
export default postOrder;
