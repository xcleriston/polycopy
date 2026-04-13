var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import Logger from './logger.js';
const defaultOptions = {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 10000,
    onRetry: (error, attempt) => {
        Logger.warning(`Attempt ${attempt} failed: ${error.message || error}. Retrying...`);
    },
};
export const retry = (fn_1, ...args_1) => __awaiter(void 0, [fn_1, ...args_1], void 0, function* (fn, options = {}) {
    const opts = Object.assign(Object.assign({}, defaultOptions), options);
    let lastError;
    for (let attempt = 1; attempt <= opts.retries + 1; attempt++) {
        try {
            return yield fn();
        }
        catch (error) {
            lastError = error;
            if (attempt <= opts.retries) {
                const timeout = Math.min(opts.minTimeout * Math.pow(opts.factor, attempt - 1), opts.maxTimeout);
                opts.onRetry(error, attempt);
                yield new Promise((resolve) => setTimeout(resolve, timeout));
            }
        }
    }
    throw lastError;
});
