var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import axios from 'axios';
import { ENV } from '../config/env.js';
import { retry } from './retry.js';
import Logger from './logger.js';
const cache = new Map();
const CACHE_TTL = 2000; // 2 seconds (aggressive for <2s detection)
const fetchData = (url) => __awaiter(void 0, void 0, void 0, function* () {
    // Only cache GET requests for metadata/activity
    const isCacheable = url.includes('tick-size') || url.includes('markets') || url.includes('activity');
    if (isCacheable && cache.has(url)) {
        const cached = cache.get(url);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
    }
    const retries = ENV.NETWORK_RETRY_LIMIT;
    const timeout = ENV.REQUEST_TIMEOUT_MS;
    const data = yield retry(() => __awaiter(void 0, void 0, void 0, function* () {
        const response = yield axios.get(url, {
            timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': 'https://polymarket.com',
                'Referer': 'https://polymarket.com/',
            },
            family: 4,
        });
        return response.data;
    }), {
        retries,
        onRetry: (error, attempt) => {
            const message = axios.isAxiosError(error) ? error.code || error.message : String(error);
            if (message === 'ERR_BAD_REQUEST') {
                // Don't log full error for 429
                return;
            }
            Logger.warning(`Network error (attempt ${attempt}/${retries + 1}): ${message}. Retrying...`);
        },
    });
    if (isCacheable && data) {
        cache.set(url, { data, timestamp: Date.now() });
    }
    return data;
});
export default fetchData;
