import { ethers } from 'ethers';
import { ENV } from '../config/env.js';
import { Activity } from '../models/userHistory.js';
import User from '../models/user.js';
import Logger from '../utils/logger.js';
import fetchData from '../utils/fetchData.js';

const EXCHANGE_ABI = [
    "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)"
];

const POLYMARKET_EXCHANGE_ADDRS = (ENV.POLYMARKET_EXCHANGE_ADDRS || '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E,0xe2222d279d744050d28e00520010520000310F59').split(',').map(a => a.trim().toLowerCase());

// Global cache for trader proxy addresses and monitored addresses
const proxyCache = new Map<string, string | null>();
let monitoredTradersCache: string[] = [];
let lastCacheUpdate = 0;
const CACHE_REFRESH_MS = 30000; // 30 seconds

export const startChainMonitor = async () => {
    if (!ENV.WSS_RPC_URL) {
        Logger.error('WSS_RPC_URL not configured. Real-time chain monitoring disabled.');
        return;
    }

    try {
        Logger.info('Initializing High-Speed Monitor...');
        const provider = new ethers.providers.WebSocketProvider(ENV.WSS_RPC_URL);

        // Handle provider errors specifically to prevent Uncaught Exceptions
        provider.on("error", (e: any) => {
            const isRateLimit = e.message?.includes('429') || e.code?.toString() === '429';
            const isNotFound = e.message?.includes('404') || e.code?.toString() === '404';
            const waitTime = isRateLimit ? 30000 : (isNotFound ? 60000 : 15000);
            
            if (isNotFound) {
                Logger.error(`🚫 RPC Endpoint Not Found (404): Check your WSS_RPC_URL. Retrying in 60s...`);
            } else {
                Logger.error(`${isRateLimit ? '🚫 RPC Rate Limit (429)' : '❌ WebSocket Error'}: Retrying in ${waitTime/1000}s...`);
            }
            
            provider.destroy();
            setTimeout(startChainMonitor, waitTime);
        });

        // Create contracts for each exchange address
        const contracts = POLYMARKET_EXCHANGE_ADDRS.map(addr => new ethers.Contract(addr, EXCHANGE_ABI, provider));

        Logger.success('⚡ Connected to Polygon WebSocket for real-time monitoring');
        
        setInterval(() => {
            Logger.info('💓 Chain Monitor Heartbeat: Service is active');
        }, 1800000);

        // Background Cache Refresh
        setInterval(async () => {
            try {
                const traders = await User.find({ 'config.enabled': true }).lean();
                monitoredTradersCache = traders.map(u => u.config.traderAddress.toLowerCase());
                
                for (const trader of monitoredTradersCache) {
                    if (!proxyCache.has(trader)) {
                        const actUrl = `https://data-api.polymarket.com/activity?user=${trader}&type=TRADE`;
                        const activities = await fetchData(actUrl);
                        if (Array.isArray(activities) && activities.length > 0) {
                            const proxy = activities[0].proxyWallet;
                            if (proxy && proxy.toLowerCase() !== trader) {
                                proxyCache.set(trader, proxy.toLowerCase());
                                Logger.info(`[CHAIN] Detected Proxy for ${trader}: ${proxy}`);
                            } else {
                                proxyCache.set(trader, null);
                            }
                        }
                    }
                }
            } catch (e) {
                Logger.error(`[CHAIN] Cache refresh failed: ${e}`);
            }
        }, CACHE_REFRESH_MS);

        // Initial load
        const initialTraders = await User.find({ 'config.enabled': true }).lean();
        monitoredTradersCache = initialTraders.map(u => u.config.traderAddress.toLowerCase());

        contracts.forEach(contract => {
            contract.on("OrderFilled", async (...args) => {
                try {
                    const event = args[args.length - 1];
                    const eventArgs = event.args || {};
                const { maker, taker, makerAssetId, takerAssetId, makerAmountFilled, takerAmountFilled } = eventArgs;

                const txHash: string | undefined = event?.transactionHash || event?.log?.transactionHash || event?.hash;

                if (!maker || !taker || !txHash) return;

                const makerAddr = maker.toLowerCase();
                const takerAddr = taker.toLowerCase();
                
                const monitoredLower = monitoredTradersCache;

                const allTargets = [...monitoredLower, ...Array.from(proxyCache.values()).filter(v => v !== null) as string[]];

                const isMakerMonitored = allTargets.includes(makerAddr);
                const isTakerMonitored = allTargets.includes(takerAddr);

                if (isMakerMonitored || isTakerMonitored) {
                    const traderByProxy = Array.from(proxyCache.entries()).find(([t, p]) => p === makerAddr || p === takerAddr);
                    const finalTrader = traderByProxy ? traderByProxy[0] : (monitoredLower.includes(makerAddr) ? makerAddr : takerAddr);
                    
                    Logger.header(`⚡ ON-CHAIN TRADE DETECTED: ${finalTrader.slice(0, 8)}...`);

                    // AssetId 0 = USDC. If makerAssetId is 0, maker is sending USDC → buying tokens
                    const isBuy = (makerAddr === finalTrader || proxyCache.get(finalTrader) === makerAddr)
                        ? (makerAssetId.toString() === '0')
                        : (takerAssetId.toString() === '0');
                    
                    const condTokenId = (makerAddr === finalTrader || proxyCache.get(finalTrader) === makerAddr)
                        ? (isBuy ? takerAssetId : makerAssetId)
                        : (isBuy ? makerAssetId : takerAssetId);

                    const isLimit = (makerAddr === finalTrader || proxyCache.get(finalTrader) === makerAddr);

                    const activityData = {
                        traderAddress: finalTrader,
                        timestamp: Date.now(),
                        transactionHash: txHash,
                        conditionId: condTokenId.toString(),
                        type: 'TRADE',
                        orderType: isLimit ? 'LIMIT' : 'MARKET',
                        side: isBuy ? 'BUY' : 'SELL',
                        usdcSize: (makerAddr === finalTrader || proxyCache.get(finalTrader) === makerAddr)
                            ? Number(ethers.utils.formatUnits(isBuy ? makerAmountFilled : takerAmountFilled, 6))
                            : Number(ethers.utils.formatUnits(isBuy ? takerAmountFilled : makerAmountFilled, 6)),
                        bot: false,
                        processedBy: [],
                        isChainDetected: true
                    };

                    const exists = await Activity.findOne({ transactionHash: activityData.transactionHash });
                    if (!exists) {
                        const newActivity = await Activity.create(activityData);
                        Logger.success(`🚀 Instant copy triggered for ${finalTrader.slice(0, 6)} via Blockchain Event`);
                        
                        // Async enrichment - try both token_id and condition_id paths
                        (async () => {
                            try {
                                // First try to get market info via token_id
                                const tokenUrl = `https://clob.polymarket.com/markets/${activityData.conditionId}`;
                                const tokenInfo = await fetchData(tokenUrl);
                                
                                let finalConditionId = activityData.conditionId;
                                if (tokenInfo && tokenInfo.condition_id) {
                                    finalConditionId = tokenInfo.condition_id;
                                    await Activity.updateOne({ _id: newActivity._id }, { $set: { asset: activityData.conditionId, conditionId: finalConditionId } });
                                }

                                const metaUrl = `https://gamma-api.polymarket.com/events?condition_id=${finalConditionId}`;
                                const metadata = await fetchData(metaUrl);
                                if (Array.isArray(metadata) && metadata.length > 0) {
                                    const m = metadata[0];
                                    await Activity.updateOne({ _id: (newActivity as any)._id }, {
                                        $set: {
                                            title: m.title,
                                            slug: m.slug,
                                            eventSlug: m.eventSlug,
                                            icon: m.icon
                                        }
                                    });
                                }
                            } catch (e) {
                                Logger.debug(`[CHAIN] Metadata enrichment failed for ${activityData.conditionId}: ${e}`);
                            }
                        })();
                    }
                }
            } catch (err) {
                Logger.error(`Chain event processing error: ${err}`);
            }
            });
        });

        // Keep-alive heartbeat handled by provider.on("error") above
    } catch (error) {
        Logger.error('Immediate Chain Monitor error: ' + error);
        setTimeout(startChainMonitor, 15000);
    }
};
