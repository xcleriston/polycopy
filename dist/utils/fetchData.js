import axios from 'axios';
import { ENV } from '../config/env.js';
import { retry } from './retry.js';
import Logger from './logger.js';
const cache = new Map();
const CACHE_TTL = 10000; // 10 seconds (for metadata only)
const fetchData = async (url) => {
    // ONLY cache static metadata like tick-size or market list. 
    // NEVER cache activity or trades.
    const isCacheable = (url.includes('tick-size') || url.includes('markets')) && !url.includes('activity') && !url.includes('trades');
    if (isCacheable && cache.has(url)) {
        const cached = cache.get(url);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
    }
    const retries = ENV.NETWORK_RETRY_LIMIT;
    const timeout = ENV.REQUEST_TIMEOUT_MS;
    const data = await retry(async () => {
        const response = await axios.get(url, {
            timeout,
            headers: {
                'User-Agent': 'polycopy/2.0 (Node.js)',
            },
            family: 4,
        });
        return response.data;
    }, {
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
};
export default fetchData;
