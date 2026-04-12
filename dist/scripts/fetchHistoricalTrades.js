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
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const USER_ADDRESSES = env_1.ENV.USER_ADDRESSES;
const HISTORY_DAYS = (() => {
    const raw = process.env.HISTORY_DAYS;
    const value = raw ? Number(raw) : 30;
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 30;
})();
const MAX_TRADES_PER_TRADER = (() => {
    const raw = process.env.HISTORY_MAX_TRADES;
    const value = raw ? Number(raw) : 20000;
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 20000;
})();
const BATCH_SIZE = (() => {
    const raw = process.env.HISTORY_BATCH_SIZE;
    const value = raw ? Number(raw) : 100;
    return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 1000) : 100;
})();
const MAX_PARALLEL = (() => {
    const raw = process.env.HISTORY_MAX_PARALLEL;
    const value = raw ? Number(raw) : 4;
    return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 10) : 4;
})();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchBatch = (address, offset, limit) => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield axios_1.default.get(`https://data-api.polymarket.com/activity?user=${address}&type=TRADE&limit=${limit}&offset=${offset}`, {
        timeout: 15000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
    });
    return Array.isArray(response.data) ? response.data : [];
});
const fetchTradesForTrader = (address) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`\n🚀 Loading history for ${address} (last ${HISTORY_DAYS} days)`);
    const sinceTimestamp = Math.floor((Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000) / 1000);
    let offset = 0;
    let allTrades = [];
    let hasMore = true;
    while (hasMore && allTrades.length < MAX_TRADES_PER_TRADER) {
        const batchLimit = Math.min(BATCH_SIZE, MAX_TRADES_PER_TRADER - allTrades.length);
        const batch = yield fetchBatch(address, offset, batchLimit);
        if (batch.length === 0) {
            hasMore = false;
            break;
        }
        const filtered = batch.filter((trade) => trade.timestamp >= sinceTimestamp);
        allTrades.push(...filtered);
        if (batch.length < batchLimit || filtered.length < batch.length) {
            hasMore = false;
        }
        offset += batchLimit;
        if (allTrades.length % (BATCH_SIZE * MAX_PARALLEL) === 0) {
            yield sleep(150);
        }
    }
    const sorted = allTrades.sort((a, b) => a.timestamp - b.timestamp);
    console.log(`✓ Retrieved ${sorted.length} trades`);
    return sorted;
});
const saveTradesToCache = (address, trades) => {
    const cacheDir = path_1.default.join(process.cwd(), 'trader_data_cache');
    if (!fs_1.default.existsSync(cacheDir)) {
        fs_1.default.mkdirSync(cacheDir, { recursive: true });
    }
    const today = new Date().toISOString().split('T')[0];
    const cacheFile = path_1.default.join(cacheDir, `${address}_${HISTORY_DAYS}d_${today}.json`);
    const payload = {
        name: `trader_${address.slice(0, 6)}_${HISTORY_DAYS}d_${today}`,
        traderAddress: address,
        fetchedAt: new Date().toISOString(),
        period: `${HISTORY_DAYS}_days`,
        historyDays: HISTORY_DAYS,
        totalTrades: trades.length,
        trades,
    };
    fs_1.default.writeFileSync(cacheFile, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`💾 Saved to ${cacheFile}`);
};
const chunk = (array, size) => {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
};
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    if (USER_ADDRESSES.length === 0) {
        console.log('USER_ADDRESSES is empty. Check .env');
        return;
    }
    console.log('📥 Starting trade history export');
    console.log(`Traders: ${USER_ADDRESSES.length}`);
    console.log(`Period: ${HISTORY_DAYS} days, max ${MAX_TRADES_PER_TRADER} trades per trader`);
    const addressChunks = chunk(USER_ADDRESSES, MAX_PARALLEL);
    for (const chunkItem of addressChunks) {
        yield Promise.all(chunkItem.map((address) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const trades = yield fetchTradesForTrader(address);
                saveTradesToCache(address, trades);
            }
            catch (error) {
                console.error(`✗ Error loading for ${address}:`, error);
            }
        })));
    }
    console.log('\n✅ Export completed');
});
main();
