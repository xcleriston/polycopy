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
        this.updateTraders();
    }
    updateTraders() {
        return __awaiter(this, void 0, void 0, function* () {
            const traders = yield User.distinct('config.traderAddress', { 'config.enabled': true });
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
            this.connect();
            // Refresh trader list every 30 seconds for near-instant detection of new settings
            setInterval(() => this.updateTraders(), 30 * 1000);
        });
    }
    connect() {
        if (this.reconnectTimeout)
            clearTimeout(this.reconnectTimeout);
        this.ws = new WebSocket(ENV.CLOB_WS_URL);
        this.ws.on('open', () => {
            var _a;
            Logger.success('⚡ Connected to Polymarket CLOB WebSocket for ultra-fast detection');
            // Subscribe to fills. Note: Some versions of CLOB WS require asset_ids.
            // If asset_ids is omitted, some implementations send all fills.
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
                // Polymarket CLOB WS payload structure for fills
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
            catch (err) {
                // Silently handle parse errors or non-JSON heartbeats
            }
        }));
        this.ws.on('error', (err) => {
            Logger.error(`WebSocket Monitor Error: ${err.message}`);
        });
        this.ws.on('close', () => {
            Logger.warning('WebSocket Monitor disconnected. Reconnecting in 5s...');
            this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
        });
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
}
export const startWSMonitor = () => {
    const monitor = new WSMonitor();
    monitor.start();
};
export default startWSMonitor;
