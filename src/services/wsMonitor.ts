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
    private ws: WebSocket | null = null;
    private monitoredTraders: Set<string> = new Set();
    private reconnectTimeout: NodeJS.Timeout | null = null;

    constructor() {
        this.updateTraders();
    }

    private async updateTraders() {
        const traders = await User.distinct('config.traderAddress', { 'config.enabled': true });
        this.monitoredTraders = new Set(traders.map((t: string) => t.toLowerCase()));
    }

    public async start() {
        if (!ENV.CLOB_WS_URL) {
            Logger.error('CLOB_WS_URL not configured. WS Monitor disabled.');
            return;
        }

        Logger.info('Initializing Ultra-Fast CLOB WebSocket Monitor...');
        this.connect();
        
        // Refresh trader list every 30 seconds for near-instant detection of new settings
        setInterval(() => this.updateTraders(), 30 * 1000);
    }

    private connect() {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        
        this.ws = new WebSocket(ENV.CLOB_WS_URL);

        this.ws.on('open', () => {
            Logger.success('⚡ Connected to Polymarket CLOB WebSocket for ultra-fast detection');
            
            // Subscribe to fills. Note: Some versions of CLOB WS require asset_ids.
            // If asset_ids is omitted, some implementations send all fills.
            const subMessage = {
                type: 'subscribe',
                topic: 'fills'
            };
            this.ws?.send(JSON.stringify(subMessage));
        });

        this.ws.on('message', async (data: string) => {
            try {
                const message = JSON.parse(data.toString());
                
                // Polymarket CLOB WS payload structure for fills
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
            } catch (err) {
                // Silently handle parse errors or non-JSON heartbeats
            }
        });

        this.ws.on('error', (err: Error) => {
            Logger.error(`WebSocket Monitor Error: ${err.message}`);
        });

        this.ws.on('close', () => {
            Logger.warning('WebSocket Monitor disconnected. Reconnecting in 5s...');
            this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
        });
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
                    processedBy: [],
                    isWSDetected: true
                });
                
                Logger.success(`Trade recorded via Ultra-Fast WebSocket (${fill.side})`);
            }
        } catch (err) {
            Logger.error(`Error processing WS fill: ${err}`);
        }
    }
}

export const startWSMonitor = () => {
    const monitor = new WSMonitor();
    monitor.start();
};

export default startWSMonitor;
