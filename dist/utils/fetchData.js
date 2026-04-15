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
const directAxios = axios.create({
    httpsAgent: undefined,
    httpAgent: undefined,
    proxy: false
});
const fetchData = (url) => __awaiter(void 0, void 0, void 0, function* () {
    const retries = ENV.NETWORK_RETRY_LIMIT;
    const timeout = ENV.REQUEST_TIMEOUT_MS;
    return yield retry(() => __awaiter(void 0, void 0, void 0, function* () {
        const response = yield directAxios.get(url, {
            timeout,
            headers: {
                'User-Agent': 'polycopy/2.0 (Node.js)',
            },
            family: 4,
        });
        return response.data;
    }), {
        retries,
        onRetry: (error, attempt) => {
            const message = axios.isAxiosError(error) ? error.code || error.message : String(error);
            Logger.warning(`Network error (attempt ${attempt}/${retries + 1}): ${message}. Retrying...`);
        },
    });
});
export default fetchData;
