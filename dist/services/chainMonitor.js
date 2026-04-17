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
let isChainMonitorRunning = true;
let chainProvider = null;
export const stopChainMonitor = () => {
    isChainMonitorRunning = false;
    if (chainProvider) {
        chainProvider.removeAllListeners();
        chainProvider.destroy();
        chainProvider = null;
    }
};
export const startChainMonitor = () => __awaiter(void 0, void 0, void 0, function* () {
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
        provider.on("error", (e) => {
            var _a, _b;
            const isRateLimit = ((_a = e.message) === null || _a === void 0 ? void 0 : _a.includes('429')) || ((_b = e.code) === null || _b === void 0 ? void 0 : _b.toString()) === '429';
            const waitTime = isRateLimit ? 30000 : 15000;
            Logger.error(`${isRateLimit ? '🚫 RPC Rate Limit (429)' : '❌ WebSocket Error'}: Retrying in ${waitTime / 1000}s...`);
            provider.destroy();
            setTimeout(startChainMonitor, waitTime);
        });
        const contract = new ethers.Contract(POLYMARKET_EXCHANGE_ADDR, EXCHANGE_ABI, provider);
        Logger.success('⚡ Connected to Polygon WebSocket for real-time monitoring');
        contract.on("OrderFilled", (...args) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            try {
                const event = args[args.length - 1];
                const eventArgs = event.args || {};
                const { maker, taker, makerAssetId, takerAssetId, makerAmountFilled, takerAmountFilled } = eventArgs;
                // Safe tx hash extraction — location varies between ethers v5 versions
                const txHash = (event === null || event === void 0 ? void 0 : event.transactionHash) || ((_a = event === null || event === void 0 ? void 0 : event.log) === null || _a === void 0 ? void 0 : _a.transactionHash) || (event === null || event === void 0 ? void 0 : event.hash);
                if (!maker || !taker || !txHash) {
                    Logger.warning('⚠️ Incomplete event data received, skipping...');
                    return;
                }
                const makerAddr = maker.toLowerCase();
                const takerAddr = taker.toLowerCase();
                const monitoredTraders = yield User.distinct('config.traderAddress', { 'config.enabled': true });
                const monitoredLower = monitoredTraders.map((t) => t.toLowerCase());
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
                    const exists = yield Activity.findOne({ transactionHash: activityData.transactionHash });
                    if (!exists) {
                        yield Activity.create(activityData);
                        Logger.success(`🚀 Instant copy triggered for ${targetTrader.slice(0, 6)} via Blockchain Event`);
                    }
                }
            }
            catch (err) {
                Logger.error(`Chain event processing error: ${err}`);
            }
        }));
        // Keep-alive heartbeat handled by provider.on("error") above
    }
    catch (error) {
        Logger.error('Immediate Chain Monitor error: ' + error);
        setTimeout(startChainMonitor, 15000);
    }
});
