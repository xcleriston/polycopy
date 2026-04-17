var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import WebSocket from 'ws';
import { ENV } from '../config/env.js';
import { Activity } from '../models/userHistory.js';
import User from '../models/user.js';
import Logger from '../utils/logger.js';
/**
 * High-Speed Polymarket CLOB WebSocket Monitor
 * Provides sub-second trade detection by listening directly to CLOB fills.
 */
export class WSMonitor {
    constructor() {
        this.ws = null;
        this.monitoredTraders = new Set();
        this.reconnectTimeout = null;
        this.retryCount = 0;
        this.MAX_BACKOFF = 60000; // 1 minute cap
        // Constructor is kept synchronous for safe startup
    }
    updateTraders() {
        return __awaiter(this, void 0, void 0, function* () {
            const traders = yield User.distinct('config.traderAddress', {
                'config.enabled': true,
                'config.mode': 'COPY' // Only follow traders for COPY users
            });
            this.monitoredTraders = new Set(traders.map((t) => t.toLowerCase()));
        });
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!ENV.CLOB_WS_URL) {
                Logger.error('CLOB_WS_URL not configured. WS Monitor disabled.');
                return;
            }
            Logger.info('Initializing Ultra-Fast CLOB WebSocket Monitor...');
            // Initial sync of traders before connecting
            yield this.updateTraders().catch(err => Logger.error(`WS Trader Sync Error: ${err}`));
            this.connect();
            // Refresh trader list every 30 seconds
            setInterval(() => this.updateTraders().catch(() => { }), 30 * 1000);
        });
    }
    connect() {
        if (this.reconnectTimeout)
            clearTimeout(this.reconnectTimeout);
        try {
            // Circuit Breaker: Criação segura do objeto WS
            this.ws = new WebSocket(ENV.CLOB_WS_URL);
            this.ws.on('open', () => {
                var _a;
                Logger.success('⚡ Connected to Polymarket CLOB WebSocket');
                this.retryCount = 0; // Reset backoff on success
                const subMessage = {
                    type: 'subscribe',
                    topic: 'fills'
                };
                (_a = this.ws) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify(subMessage));
            });
            this.ws.on('message', (data) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                try {
                    const message = JSON.parse(data.toString());
                    if (message.topic === 'fills' && Array.isArray(message.data)) {
                        for (const fill of message.data) {
                            const maker = (_a = fill.maker) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                            const taker = (_b = fill.taker) === null || _b === void 0 ? void 0 : _b.toLowerCase();
                            if (this.monitoredTraders.has(maker) || this.monitoredTraders.has(taker)) {
                                const targetTrader = this.monitoredTraders.has(maker) ? maker : taker;
                                yield this.processFill(fill, targetTrader);
                            }
                        }
                    }
                }
                catch (err) { }
            }));
            this.ws.on('error', (err) => {
                var _a;
                const backoff = Math.min(Math.pow(2, this.retryCount) * 1000, this.MAX_BACKOFF);
                if ((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes('404')) {
                    Logger.warning(`[WS] Endpoint 404 (Handled). Retrying in ${backoff / 1000}s...`);
                }
                else {
                    Logger.warning(`[WS] Connection Error: ${err.message}. Retrying in ${backoff / 1000}s...`);
                }
            });
            this.ws.on('close', (code) => {
                const backoff = Math.min(Math.pow(2, this.retryCount) * 1000, this.MAX_BACKOFF);
                if (code !== 1000) {
                    this.reconnectTimeout = setTimeout(() => {
                        this.retryCount++;
                        this.connect();
                    }, backoff);
                }
            });
        }
        catch (err) {
            const backoff = Math.min(Math.pow(2, this.retryCount) * 1000, this.MAX_BACKOFF);
            Logger.error(`[WS] Critical Handshake Failure: ${err.message}. Retrying in ${backoff / 1000}s...`);
            this.reconnectTimeout = setTimeout(() => {
                this.retryCount++;
                this.connect();
            }, backoff);
        }
    }
    processFill(fill, traderAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                // Polymarket Fills don't always have the full activity data 
                // but they have condition_id, side, and size.
                const txHash = fill.transaction_hash;
                if (!txHash)
                    return;
                const existing = yield Activity.findOne({ transactionHash: txHash });
                if (!existing) {
                    Logger.header(`🚀 INSTANT WS DETECT: ${traderAddress.slice(0, 6)}...`);
                    yield Activity.create({
                        traderAddress,
                        timestamp: Date.now(),
                        transactionHash: txHash,
                        conditionId: fill.condition_id,
                        type: 'TRADE',
                        side: ((_a = fill.side) === null || _a === void 0 ? void 0 : _a.toUpperCase()) || 'BUY',
                        usdcSize: Number(fill.size) * Number(fill.price),
                        bot: false,
                        processedBy: [],
                        isWSDetected: true
                    });
                    Logger.success(`Trade recorded via Ultra-Fast WebSocket (${fill.side})`);
                }
            }
            catch (err) {
                Logger.error(`Error processing WS fill: ${err}`);
            }
        });
    }
    stop() {
        if (this.reconnectTimeout)
            clearTimeout(this.reconnectTimeout);
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.terminate();
            this.ws = null;
        }
        Logger.info('WS Monitor stopped');
    }
}
let activeWSMonitor = null;
export const startWSMonitor = () => {
    if (activeWSMonitor)
        activeWSMonitor.stop();
    activeWSMonitor = new WSMonitor();
    activeWSMonitor.start();
};
export const stopWSMonitor = () => {
    if (activeWSMonitor) {
        activeWSMonitor.stop();
        activeWSMonitor = null;
    }
};
export default startWSMonitor;
