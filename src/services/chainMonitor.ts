import { ethers } from 'ethers';
import { ENV } from '../config/env.js';
import { Activity } from '../models/userHistory.js';
import User from '../models/user.js';
import Logger from '../utils/logger.js';

const EXCHANGE_ABI = [
    "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)"
];

const POLYMARKET_EXCHANGE_ADDR = ENV.POLYMARKET_EXCHANGE_ADDR;

let isChainMonitorRunning = true;
let chainProvider: ethers.providers.WebSocketProvider | null = null;

export const stopChainMonitor = () => {
    isChainMonitorRunning = false;
    if (chainProvider) {
        chainProvider.removeAllListeners();
        chainProvider.destroy();
        chainProvider = null;
    }
};

export const startChainMonitor = async () => {
    if (!ENV.WSS_RPC_URL) {
        Logger.error('WSS_RPC_URL not configured. Real-time chain monitoring disabled.');
        return;
    }
    
    isChainMonitorRunning = true;
    try {
        Logger.info('Initializing High-Speed Monitor...');
        chainProvider = new ethers.providers.WebSocketProvider(ENV.WSS_RPC_URL);
        const provider = chainProvider;

        // Handle provider errors specifically to prevent Uncaught Exceptions
        provider.on("error", (e: any) => {
            const isRateLimit = e.message?.includes('429') || e.code?.toString() === '429';
            const waitTime = isRateLimit ? 30000 : 15000;
            Logger.error(`${isRateLimit ? '🚫 RPC Rate Limit (429)' : '❌ WebSocket Error'}: Retrying in ${waitTime/1000}s...`);
            provider.destroy();
            setTimeout(startChainMonitor, waitTime);
        });

        const contract = new ethers.Contract(POLYMARKET_EXCHANGE_ADDR, EXCHANGE_ABI, provider);

        Logger.success('⚡ Connected to Polygon WebSocket for real-time monitoring');

        contract.on("OrderFilled", async (...args) => {
            try {
                const event = args[args.length - 1];
                const eventArgs = event.args || {};
                const { maker, taker, makerAssetId, takerAssetId, makerAmountFilled, takerAmountFilled } = eventArgs;

                // Safe tx hash extraction — location varies between ethers v5 versions
                const txHash: string | undefined = event?.transactionHash || event?.log?.transactionHash || event?.hash;

                if (!maker || !taker || !txHash) {
                    Logger.warning('⚠️ Incomplete event data received, skipping...');
                    return;
                }

                const makerAddr = maker.toLowerCase();
                const takerAddr = taker.toLowerCase();

                const monitoredTraders = await User.distinct('config.traderAddress', { 
                    'config.enabled': true,
                    'config.mode': 'COPY' // Somente seguir se o usuário quiser cópia
                });
                const monitoredLower = (monitoredTraders as string[]).map((t: string) => t.toLowerCase());

                const isMakerMonitored = monitoredLower.includes(makerAddr);
                const isTakerMonitored = monitoredLower.includes(takerAddr);

                if (isMakerMonitored || isTakerMonitored) {
                    const targetTrader = isMakerMonitored ? makerAddr : takerAddr;
                    Logger.header(`⚡ ON-CHAIN TRADE DETECTED: ${targetTrader.slice(0, 6)}...`);

                    // AssetId 0 = USDC. If makerAssetId is 0, maker is sending USDC → buying tokens
                    const isBuy = isMakerMonitored ? (makerAssetId.toString() === '0') : (takerAssetId.toString() === '0');
                    const condTokenId = isMakerMonitored
                        ? (isBuy ? takerAssetId : makerAssetId)
                        : (isBuy ? makerAssetId : takerAssetId);

                    const activityData = {
                        traderAddress: targetTrader,
                        timestamp: Date.now(),
                        transactionHash: txHash,
                        conditionId: condTokenId.toString(),
                        type: 'TRADE',
                        side: isBuy ? 'BUY' : 'SELL',
                        usdcSize: isBuy
                            ? Number(ethers.utils.formatUnits(isMakerMonitored ? makerAmountFilled : takerAmountFilled, 6))
                            : Number(ethers.utils.formatUnits(isMakerMonitored ? takerAmountFilled : makerAmountFilled, 6)),
                        bot: false,
                        processedBy: [],
                        isChainDetected: true
                    };

                    const exists = await Activity.findOne({ transactionHash: activityData.transactionHash });
                    if (!exists) {
                        await Activity.create(activityData);
                        Logger.success(`🚀 Instant copy triggered for ${targetTrader.slice(0, 6)} via Blockchain Event`);
                    }
                }
            } catch (err) {
                Logger.error(`Chain event processing error: ${err}`);
            }
        });

        // Keep-alive heartbeat handled by provider.on("error") above
    } catch (error) {
        Logger.error('Immediate Chain Monitor error: ' + error);
        setTimeout(startChainMonitor, 15000);
    }
};
