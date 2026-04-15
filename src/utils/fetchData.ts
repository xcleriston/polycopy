import axios, { AxiosError } from 'axios';
import { ENV } from '../config/env.js';
import { retry } from './retry.js';
import Logger from './logger.js';

const directAxios = axios.create({
    httpsAgent: undefined,
    httpAgent: undefined,
    proxy: false
});

const fetchData = async (url: string) => {
    const retries = ENV.NETWORK_RETRY_LIMIT;
    const timeout = ENV.REQUEST_TIMEOUT_MS;

    return await retry(
        async () => {
            const response = await directAxios.get(url, {
                timeout,
                headers: {
                    'User-Agent': 'polycopy/2.0 (Node.js)',
                },
                family: 4,
            });
            return response.data;
        },
        {
            retries,
            onRetry: (error, attempt) => {
                const message = axios.isAxiosError(error) ? error.code || error.message : String(error);
                Logger.warning(`Network error (attempt ${attempt}/${retries + 1}): ${message}. Retrying...`);
            },
        }
    );
};

export default fetchData;
