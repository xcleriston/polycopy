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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isNetworkError = (error) => {
    if (axios.isAxiosError(error)) {
        const axiosError = error;
        const code = axiosError.code;
        // Network timeout/connection errors
        return (code === 'ETIMEDOUT' ||
            code === 'ENETUNREACH' ||
            code === 'ECONNRESET' ||
            code === 'ECONNREFUSED' ||
            !axiosError.response); // No response = network issue
    }
    return false;
};
const fetchData = (url) => __awaiter(void 0, void 0, void 0, function* () {
    const retries = ENV.NETWORK_RETRY_LIMIT;
    const timeout = ENV.REQUEST_TIMEOUT_MS;
    const retryDelay = 1000; // 1 second base delay
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = yield axios.get(url, {
                timeout,
                headers: {
                    'User-Agent': 'polycopy/2.0 (Node.js)',
                },
                // Force IPv4 to avoid IPv6 connectivity issues
                family: 4,
            });
            return response.data;
        }
        catch (error) {
            const isLastAttempt = attempt === retries;
            if (isNetworkError(error) && !isLastAttempt) {
                const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
                console.warn(`⚠️  Network error (attempt ${attempt}/${retries}), retrying in ${delay / 1000}s...`);
                yield sleep(delay);
                continue;
            }
            // If it's the last attempt or not a network error, throw
            if (isLastAttempt && isNetworkError(error)) {
                console.error(`❌ Network timeout after ${retries} attempts -`, axios.isAxiosError(error) ? error.code : 'Unknown error');
            }
            throw error;
        }
    }
});
export default fetchData;
