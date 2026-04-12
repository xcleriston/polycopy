"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const clob_client_1 = require("@polymarket/clob-client");
const env_1 = require("../config/env");
const createClobClient_1 = __importDefault(require("../utils/createClobClient"));
const fetchData_1 = __importDefault(require("../utils/fetchData"));
const PROXY_WALLET = env_1.ENV.PROXY_WALLET;
const USER_ADDRESSES = env_1.ENV.USER_ADDRESSES;
const RETRY_LIMIT = env_1.ENV.RETRY_LIMIT;
// Polymarket enforces a 1 token minimum on sell orders
const MIN_SELL_TOKENS = 1.0;
const ZERO_THRESHOLD = 0.0001;
const extractOrderError = (response) => {
    if (!response) {
        return undefined;
    }
    if (typeof response === 'string') {
        return response;
    }
    if (typeof response === 'object') {
        const data = response;
        const directError = data.error;
        if (typeof directError === 'string') {
            return directError;
        }
        if (typeof directError === 'object' && directError !== null) {
            const nested = directError;
            if (typeof nested.error === 'string') {
                return nested.error;
            }
            if (typeof nested.message === 'string') {
                return nested.message;
            }
        }
        if (typeof data.errorMsg === 'string') {
            return data.errorMsg;
        }
        if (typeof data.message === 'string') {
            return data.message;
        }
    }
    return undefined;
};
const isInsufficientBalanceOrAllowanceError = (message) => {
    if (!message) {
        return false;
    }
    const lower = message.toLowerCase();
    return lower.includes('not enough balance') || lower.includes('allowance');
};
const updatePolymarketCache = (clobClient, tokenId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield clobClient.updateBalanceAllowance({
            asset_type: clob_client_1.AssetType.CONDITIONAL,
            token_id: tokenId,
        });
    }
    catch (error) {
        console.log(`⚠️  Failed to refresh balance cache for ${tokenId}:`, error);
    }
});
const sellEntirePosition = (clobClient, position) => __awaiter(void 0, void 0, void 0, function* () {
    let remaining = position.size;
    let attempts = 0;
    let soldTokens = 0;
    let proceedsUsd = 0;
    if (remaining < MIN_SELL_TOKENS) {
        console.log(`   ❌ Position size ${remaining.toFixed(4)} < ${MIN_SELL_TOKENS} token minimum, skipping`);
        return { soldTokens: 0, proceedsUsd: 0, remainingTokens: remaining };
    }
    yield updatePolymarketCache(clobClient, position.asset);
    while (remaining >= MIN_SELL_TOKENS && attempts < RETRY_LIMIT) {
        const orderBook = yield clobClient.getOrderBook(position.asset);
        if (!orderBook.bids || orderBook.bids.length === 0) {
            console.log('   ❌ Order book has no bids – liquidity unavailable');
            break;
        }
        const bestBid = orderBook.bids.reduce((max, bid) => {
            return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
        }, orderBook.bids[0]);
        const bidSize = parseFloat(bestBid.size);
        const bidPrice = parseFloat(bestBid.price);
        if (bidSize < MIN_SELL_TOKENS) {
            console.log(`   ❌ Best bid only for ${bidSize.toFixed(2)} tokens (< ${MIN_SELL_TOKENS})`);
            break;
        }
        const sellAmount = Math.min(remaining, bidSize);
        if (sellAmount < MIN_SELL_TOKENS) {
            console.log(`   ❌ Remaining amount ${sellAmount.toFixed(4)} below minimum sell size`);
            break;
        }
        const orderArgs = {
            side: clob_client_1.Side.SELL,
            tokenID: position.asset,
            amount: sellAmount,
            price: bidPrice,
        };
        try {
            const signedOrder = yield clobClient.createMarketOrder(orderArgs);
            const resp = yield clobClient.postOrder(signedOrder, clob_client_1.OrderType.FOK);
            if (resp.success === true) {
                const tradeValue = sellAmount * bidPrice;
                soldTokens += sellAmount;
                proceedsUsd += tradeValue;
                remaining -= sellAmount;
                attempts = 0;
                console.log(`   ✅ Sold ${sellAmount.toFixed(2)} tokens @ $${bidPrice.toFixed(3)} (≈ $${tradeValue.toFixed(2)})`);
            }
            else {
                attempts += 1;
                const errorMessage = extractOrderError(resp);
                if (isInsufficientBalanceOrAllowanceError(errorMessage)) {
                    console.log(`   ❌ Order rejected: ${errorMessage !== null && errorMessage !== void 0 ? errorMessage : 'balance/allowance issue'}`);
                    break;
                }
                console.log(`   ⚠️  Sell attempt ${attempts}/${RETRY_LIMIT} failed${errorMessage ? ` – ${errorMessage}` : ''}`);
            }
        }
        catch (error) {
            attempts += 1;
            console.log(`   ⚠️  Sell attempt ${attempts}/${RETRY_LIMIT} threw error:`, error);
        }
    }
    if (remaining >= MIN_SELL_TOKENS) {
        console.log(`   ⚠️  Remaining unsold: ${remaining.toFixed(2)} tokens`);
    }
    else if (remaining > 0) {
        console.log(`   ℹ️  Residual dust < ${MIN_SELL_TOKENS} token left (${remaining.toFixed(4)})`);
    }
    return { soldTokens, proceedsUsd, remainingTokens: remaining };
});
const loadPositions = (address) => __awaiter(void 0, void 0, void 0, function* () {
    const url = `https://data-api.polymarket.com/positions?user=${address}`;
    const data = yield (0, fetchData_1.default)(url);
    const positions = Array.isArray(data) ? data : [];
    return positions.filter((pos) => (pos.size || 0) > ZERO_THRESHOLD);
});
const buildTrackedSet = () => __awaiter(void 0, void 0, void 0, function* () {
    const tracked = new Set();
    for (const user of USER_ADDRESSES) {
        try {
            const positions = yield loadPositions(user);
            positions.forEach((pos) => {
                if ((pos.size || 0) > ZERO_THRESHOLD) {
                    tracked.add(`${pos.conditionId}:${pos.asset}`);
                }
            });
        }
        catch (error) {
            console.log(`⚠️  Failed to load positions for ${user}:`, error);
        }
    }
    return tracked;
});
const logPositionHeader = (position, index, total) => {
    console.log(`\n${index + 1}/${total} ▶ ${position.title || position.slug || position.asset}`);
    if (position.outcome) {
        console.log(`   Outcome: ${position.outcome}`);
    }
    console.log(`   Size: ${position.size.toFixed(2)} tokens @ avg $${position.avgPrice.toFixed(3)}`);
    console.log(`   Est. value: $${position.currentValue.toFixed(2)} (cur price $${position.curPrice.toFixed(3)})`);
    if (position.redeemable) {
        console.log('   ℹ️  Market is redeemable — consider redeeming if value stays flat at $0.');
    }
};
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('🚀 Closing stale positions (tracked traders already exited)');
    console.log('════════════════════════════════════════════════════');
    console.log(`Wallet: ${PROXY_WALLET}`);
    const clobClient = yield (0, createClobClient_1.default)();
    console.log('✅ Connected to Polymarket CLOB');
    const [myPositions, trackedPositions] = yield Promise.all([
        loadPositions(PROXY_WALLET),
        buildTrackedSet(),
    ]);
    if (myPositions.length === 0) {
        console.log('\n🎉 No open positions detected for proxy wallet.');
        return;
    }
    const stalePositions = myPositions.filter((pos) => !trackedPositions.has(`${pos.conditionId}:${pos.asset}`));
    if (stalePositions.length === 0) {
        console.log('\n✅ All positions still held by tracked traders. Nothing to close.');
        return;
    }
    console.log(`\nFound ${stalePositions.length} stale position(s) to unwind.`);
    let totalTokens = 0;
    let totalProceeds = 0;
    for (let i = 0; i < stalePositions.length; i += 1) {
        const position = stalePositions[i];
        logPositionHeader(position, i, stalePositions.length);
        try {
            const result = yield sellEntirePosition(clobClient, position);
            totalTokens += result.soldTokens;
            totalProceeds += result.proceedsUsd;
        }
        catch (error) {
            console.log('   ❌ Failed to close position due to unexpected error:', error);
        }
    }
    console.log('\n════════════════════════════════════════════════════');
    console.log('✅ Close-out summary');
    console.log(`Markets touched: ${stalePositions.length}`);
    console.log(`Tokens sold: ${totalTokens.toFixed(2)}`);
    console.log(`USDC realized (approx.): $${totalProceeds.toFixed(2)}`);
    console.log('════════════════════════════════════════════════════\n');
});
main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error('❌ Script aborted due to error:', error);
    process.exit(1);
});
