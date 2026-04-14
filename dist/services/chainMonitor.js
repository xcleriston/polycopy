var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ethers } from 'ethers';
import { ENV } from '../config/env.js';
import { Activity } from '../models/userHistory.js';
import User from '../models/user.js';
import Logger from '../utils/logger.js';
const EXCHANGE_ABI = [
    "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)"
];
const POLYMARKET_EXCHANGE_ADDR = ENV.POLYMARKET_EXCHANGE_ADDR;
export const startChainMonitor = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!ENV.WSS_RPC_URL) {
        Logger.error('WSS_RPC_URL not configured. Real-time chain monitoring disabled.');
        return;
    }
    try {
        const provider = new ethers.providers.WebSocketProvider(ENV.WSS_RPC_URL);
        const contract = new ethers.Contract(POLYMARKET_EXCHANGE_ADDR, EXCHANGE_ABI, provider);
        Logger.success('⚡ Connected to Polygon WebSocket for real-time monitoring');
        contract.on("OrderFilled", (...args) => __awaiter(void 0, void 0, void 0, function* () {
            const event = args[args.length - 1]; // Last arg is the event object
            const { maker, taker, makerAssetId, takerAssetId, makerAmountFilled, takerAmountFilled, transactionHash } = event.args || event;
            const makerAddr = maker.toLowerCase();
            const takerAddr = taker.toLowerCase();
            // Check if either maker or taker is one of our monitored traders
            const monitoredTraders = yield User.distinct('config.traderAddress', { 'config.enabled': true });
            const monitoredLower = monitoredTraders.map(t => t.toLowerCase());
            const isMakerMonitored = monitoredLower.includes(makerAddr);
            const isTakerMonitored = monitoredLower.includes(takerAddr);
            if (isMakerMonitored || isTakerMonitored) {
                const targetTrader = isMakerMonitored ? makerAddr : takerAddr;
                Logger.header(`⚡ ON-CHAIN TRADE DETECTED: ${targetTrader.slice(0, 6)}...`);
                // Determine side and asset
                // AssetId 0 is usually USDC (Collateral)
                // If makerAssetId is 0, maker is SENDING USDC to GET tokens (BUY)
                // If takerAssetId is 0, taker is SENDING USDC to GET tokens (BUY)
                const isBuy = isMakerMonitored ? (makerAssetId.toString() === '0') : (takerAssetId.toString() === '0');
                const condTokenId = isMakerMonitored ? (isBuy ? takerAssetId : makerAssetId) : (isBuy ? makerAssetId : takerAssetId);
                // Create a basic activity record
                // Note: Human readable titles/slugs will be filled by the polling monitor backup
                const activityData = {
                    traderAddress: targetTrader,
                    timestamp: Date.now(),
                    transactionHash: event.log.transactionHash,
                    conditionId: condTokenId.toString(),
                    type: 'TRADE',
                    side: isBuy ? 'BUY' : 'SELL',
                    usdcSize: isBuy ?
                        Number(ethers.utils.formatUnits(isMakerMonitored ? makerAmountFilled : takerAmountFilled, 6)) :
                        Number(ethers.utils.formatUnits(isMakerMonitored ? takerAmountFilled : makerAmountFilled, 6)),
                    bot: false, // Mark as unprocessed for tradeExecutor
                    processedBy: [],
                    isChainDetected: true
                };
                // Check if already exists (prevent race condition with polling)
                const exists = yield Activity.findOne({ transactionHash: activityData.transactionHash });
                if (!exists) {
                    yield Activity.create(activityData);
                    Logger.success(`🚀 Instant copy triggered for ${targetTrader.slice(0, 6)} via Blockchain Event`);
                }
            }
        }));
        // Keep-alive heartbeat
        provider.on("error", (e) => {
            Logger.error('WebSocket Provider Error:' + e);
            setTimeout(startChainMonitor, 5000); // Reconnect
        });
    }
    catch (error) {
        Logger.error('Failed to start Chain Monitor:' + error);
        setTimeout(startChainMonitor, 10000);
    }
});
