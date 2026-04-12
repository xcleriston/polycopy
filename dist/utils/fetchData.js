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
const env_1 = require("../config/env");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isNetworkError = (error) => {
    if (axios_1.default.isAxiosError(error)) {
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
    const retries = env_1.ENV.NETWORK_RETRY_LIMIT;
    const timeout = env_1.ENV.REQUEST_TIMEOUT_MS;
    const retryDelay = 1000; // 1 second base delay
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = yield axios_1.default.get(url, {
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
                console.error(`❌ Network timeout after ${retries} attempts -`, axios_1.default.isAxiosError(error) ? error.code : 'Unknown error');
            }
            throw error;
        }
    }
});
exports.default = fetchData;
