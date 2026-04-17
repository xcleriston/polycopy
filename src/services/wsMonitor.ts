import WebSocket from 'ws';
import { ENV } from '../config/env.js';
import { Activity } from '../models/userHistory.js';
import User from '../models/user.js';
import Logger from '../utils/logger.js';
import { triggerExecution } from './tradeExecutor.js';

/**
 * High-Speed Polymarket CLOB WebSocket Monitor
 * Provides sub-second trade detection by listening directly to CLOB fills.
 */
export class WSMonitor {
    private ws: WebSocket | null = null;
    private monitoredTraders: Set<string> = new Set();
    private reconnectTimeout: NodeJS.Timeout | null = null;

    private retryCount: number = 0;
    private readonly MAX_BACKOFF = 60000;
    private readonly ENDPOINTS = [
        'wss://ws-subscriptions-clob.polymarket.com/ws/market',
        'wss://clob.polymarket.com/ws/market',
        'wss://ws-subscriptions-clob.polymarket.com/ws/',
        'wss://clob.polymarket.com/ws/'
    ];
    private currentEndpointIndex = 0;

    constructor() {
        // Constructor is kept synchronous for safe startup
    }

    private async updateTraders() {
        const traders = await User.distinct('config.traderAddress', { 
            'config.enabled': true,
            'config.mode': 'COPY' // Only follow traders for COPY users
        });
        this.monitoredTraders = new Set(traders.map((t: string) => t.toLowerCase()));
    }

    public async start() {
        if (!ENV.CLOB_WS_URL) {
            Logger.error('CLOB_WS_URL not configured. WS Monitor disabled.');
            return;
        }

        Logger.info('Initializing Ultra-Fast CLOB WebSocket Monitor...');
        
        // Initial sync of traders before connecting
        await this.updateTraders().catch(err => Logger.error(`WS Trader Sync Error: ${err}`));
        
        this.connect();
        
        // Refresh trader list every 30 seconds
        setInterval(() => this.updateTraders().catch(() => {}), 30 * 1000);
    }

    private connect() {
        try {
            const url = this.ENDPOINTS[this.currentEndpointIndex];
            Logger.info(`[WS] Attempting connection to: ${url}`);
            this.ws = new WebSocket(url);

            this.ws.on('open', () => {
                Logger.success('⚡ Connected to Polymarket CLOB WebSocket');
                this.retryCount = 0; // Reset backoff on success
                
                this.ws?.send(JSON.stringify({ type: 'subscribe', topic: 'fills' }));
                this.ws?.send(JSON.stringify({ type: 'subscribe', topic: 'trades' }));
            });

            this.ws.on('message', async (data: string) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.topic === 'fills' && Array.isArray(message.data)) {
                        for (const fill of message.data) {
                            const maker = fill.maker?.toLowerCase();
                            const taker = fill.taker?.toLowerCase();

                            if (this.monitoredTraders.has(maker) || this.monitoredTraders.has(taker)) {
                                const targetTrader = this.monitoredTraders.has(maker) ? maker : taker;
                                await this.processFill(fill, targetTrader);
                            }
                        }
                    }
                } catch (err) { }
            });

            this.ws.on('error', (err: any) => {
                const backoff = Math.min(Math.pow(2, this.retryCount) * 1000, this.MAX_BACKOFF);
                if (err.message?.includes('404')) {
                    Logger.warning(`[WS] Endpoint 404 (Handled). Retrying in ${backoff/1000}s...`);
                } else {
                    Logger.warning(`[WS] Connection Error: ${err.message}. Retrying in ${backoff/1000}s...`);
                }
            });

            this.ws.on('close', (code) => {
                const backoff = Math.min(Math.pow(2, this.retryCount) * 1000, this.MAX_BACKOFF);
                if (code !== 1000) {
                    this.reconnectTimeout = setTimeout(() => {
                        this.retryCount++;
                        // Cycle endpoints on failure
                        this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.ENDPOINTS.length;
                        this.connect();
                    }, backoff);
                }
            });

        } catch (err: any) {
            const backoff = Math.min(Math.pow(2, this.retryCount) * 1000, this.MAX_BACKOFF);
            Logger.error(`[WS] Critical Handshake Failure: ${err.message}. Retrying in ${backoff/1000}s...`);
            this.reconnectTimeout = setTimeout(() => {
                this.retryCount++;
                this.connect();
            }, backoff);
        }
    }

    private async processFill(fill: any, traderAddress: string) {
        try {
            // Polymarket Fills don't always have the full activity data 
            // but they have condition_id, side, and size.
            const txHash = fill.transaction_hash;
            if (!txHash) return;

            const existing = await Activity.findOne({ transactionHash: txHash });
            if (!existing) {
                Logger.header(`🚀 INSTANT WS DETECT: ${traderAddress.slice(0, 6)}...`);
                
                await Activity.create({
                    traderAddress,
                    timestamp: Date.now(),
                    transactionHash: txHash,
                    conditionId: fill.condition_id,
                    type: 'TRADE',
                    side: fill.side?.toUpperCase() || 'BUY',
                    usdcSize: Number(fill.size) * Number(fill.price),
                    bot: false,
                    executionStatus: 'PENDENTE',
                    processedBy: [],
                    isWSDetected: true
                });
                
                Logger.success(`Trade recorded via Ultra-Fast WebSocket (\${fill.side})`);
                triggerExecution();
            }
        } catch (err) {
            Logger.error(`Error processing WS fill: ${err}`);
        }
    }

    public stop() {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.terminate();
            this.ws = null;
        }
        Logger.info('WS Monitor stopped');
    }
}

let activeWSMonitor: WSMonitor | null = null;

export const startWSMonitor = () => {
    if (activeWSMonitor) activeWSMonitor.stop();
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
