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
// @ts-ignore
import { HttpsProxyAgent } from 'https-proxy-agent';
// @ts-ignore
import { SocksProxyAgent } from 'socks-proxy-agent';
import { ENV } from '../config/env.js';
import Logger from './logger.js';
/**
 * Configure global axios to use a proxy if configured in ENV.
 * This ensures @polymarket/clob-client (which uses axios internally)
 * routes traffic through the proxy to avoid geoblocking.
 */
export const setupProxy = () => __awaiter(void 0, void 0, void 0, function* () {
    const proxyUrl = ENV.HTTPS_PROXY;
    if (proxyUrl) {
        try {
            Logger.info(`[PROXY] Configuring global proxy: ${proxyUrl.split('@')[1] || proxyUrl}`);
            let agent;
            if (proxyUrl.startsWith('socks')) {
                agent = new SocksProxyAgent(proxyUrl);
            }
            else {
                agent = new HttpsProxyAgent(proxyUrl);
            }
            // Apply to global axios defaults
            axios.defaults.httpsAgent = agent;
            axios.defaults.httpAgent = agent;
            // Also set environment variables that many libraries respect
            process.env.HTTPS_PROXY = proxyUrl;
            process.env.HTTP_PROXY = proxyUrl;
            Logger.info(`[PROXY] Global axios proxy configured successfully (${proxyUrl.startsWith('socks') ? 'SOCKS' : 'HTTP'}).`);
        }
        catch (error) {
            Logger.error(`[PROXY] Failed to configure proxy: ${error}`);
        }
    }
    else {
        Logger.info('[PROXY] No proxy configured. API calls will use default network routing.');
    }
});
export default setupProxy;
