"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopTradeMonitor = void 0;
const env_1 = require("../config/env");
const userHistory_1 = require("../models/userHistory");
const fetchData_1 = __importDefault(require("../utils/fetchData"));
const logger_1 = __importDefault(require("../utils/logger"));
const USER_ADDRESSES = env_1.ENV.USER_ADDRESSES;
const TOO_OLD_TIMESTAMP = env_1.ENV.TOO_OLD_TIMESTAMP;
const FETCH_INTERVAL = env_1.ENV.FETCH_INTERVAL;
if (!USER_ADDRESSES || USER_ADDRESSES.length === 0) {
    throw new Error('USER_ADDRESSES is not defined or empty');
}
// Create activity and position models for each user
const userModels = USER_ADDRESSES.map((address) => ({
    address,
    UserActivity: (0, userHistory_1.getUserActivityModel)(address),
    UserPosition: (0, userHistory_1.getUserPositionModel)(address),
}));
const init = () => __awaiter(void 0, void 0, void 0, function* () {
    const counts = [];
    for (const { address, UserActivity } of userModels) {
        const count = yield UserActivity.countDocuments();
        counts.push(count);
    }
    logger_1.default.clearLine();
    logger_1.default.dbConnection(USER_ADDRESSES, counts);
    // Show your own positions first
    try {
        const myPositionsUrl = `https://data-api.polymarket.com/positions?user=${env_1.ENV.PROXY_WALLET}`;
        const myPositions = yield (0, fetchData_1.default)(myPositionsUrl);
        // Get current USDC balance
        const getMyBalance = (yield Promise.resolve().then(() => __importStar(require('../utils/getMyBalance')))).default;
        const currentBalance = yield getMyBalance(env_1.ENV.PROXY_WALLET);
        if (Array.isArray(myPositions) && myPositions.length > 0) {
            // Calculate your overall profitability and initial investment
            let totalValue = 0;
            let initialValue = 0;
            let weightedPnl = 0;
            myPositions.forEach((pos) => {
                const value = pos.currentValue || 0;
                const initial = pos.initialValue || 0;
                const pnl = pos.percentPnl || 0;
                totalValue += value;
                initialValue += initial;
                weightedPnl += value * pnl;
            });
            const myOverallPnl = totalValue > 0 ? weightedPnl / totalValue : 0;
            // Get top 5 positions by profitability (PnL)
            const myTopPositions = myPositions
                .sort((a, b) => (b.percentPnl || 0) - (a.percentPnl || 0))
                .slice(0, 5);
            logger_1.default.clearLine();
            logger_1.default.myPositions(env_1.ENV.PROXY_WALLET, myPositions.length, myTopPositions, myOverallPnl, totalValue, initialValue, currentBalance);
        }
        else {
            logger_1.default.clearLine();
            logger_1.default.myPositions(env_1.ENV.PROXY_WALLET, 0, [], 0, 0, 0, currentBalance);
        }
    }
    catch (error) {
        logger_1.default.error(`Failed to fetch your positions: ${error}`);
    }
    // Show current positions count with details for traders you're copying
    const positionCounts = [];
    const positionDetails = [];
    const profitabilities = [];
    for (const { address, UserPosition } of userModels) {
        const positions = yield UserPosition.find().exec();
        positionCounts.push(positions.length);
        // Calculate overall profitability (weighted average by current value)
        let totalValue = 0;
        let weightedPnl = 0;
        positions.forEach((pos) => {
            const value = pos.currentValue || 0;
            const pnl = pos.percentPnl || 0;
            totalValue += value;
            weightedPnl += value * pnl;
        });
        const overallPnl = totalValue > 0 ? weightedPnl / totalValue : 0;
        profitabilities.push(overallPnl);
        // Get top 3 positions by profitability (PnL)
        const topPositions = positions
            .sort((a, b) => (b.percentPnl || 0) - (a.percentPnl || 0))
            .slice(0, 3)
            .map((p) => p.toObject());
        positionDetails.push(topPositions);
    }
    logger_1.default.clearLine();
    logger_1.default.tradersPositions(USER_ADDRESSES, positionCounts, positionDetails, profitabilities);
});
const fetchTradeDataForTrader = (_a) => __awaiter(void 0, [_a], void 0, function* ({ address, UserActivity, UserPosition }) {
    try {
        // Fetch trade activities from Polymarket API
        const apiUrl = `https://data-api.polymarket.com/activity?user=${address}&type=TRADE`;
        const activities = yield (0, fetchData_1.default)(apiUrl);
        if (!Array.isArray(activities) || activities.length === 0) {
            return;
        }
        // Process each activity
        const cutoffTimestamp = Date.now() / 1000 - TOO_OLD_TIMESTAMP * 3600;
        for (const activity of activities) {
            if (activity.timestamp < cutoffTimestamp)
                continue;
            const exists = yield UserActivity.findOne({
                transactionHash: activity.transactionHash,
            }).exec();
            if (exists)
                continue;
            yield UserActivity({
                proxyWallet: activity.proxyWallet,
                timestamp: activity.timestamp,
                conditionId: activity.conditionId,
                type: activity.type,
                size: activity.size,
                usdcSize: activity.usdcSize,
                transactionHash: activity.transactionHash,
                price: activity.price,
                asset: activity.asset,
                side: activity.side,
                outcomeIndex: activity.outcomeIndex,
                title: activity.title,
                slug: activity.slug,
                icon: activity.icon,
                eventSlug: activity.eventSlug,
                outcome: activity.outcome,
                name: activity.name,
                pseudonym: activity.pseudonym,
                bio: activity.bio,
                profileImage: activity.profileImage,
                profileImageOptimized: activity.profileImageOptimized,
                bot: false,
                botExcutedTime: 0,
            }).save();
            logger_1.default.info(`New trade detected for ${address.slice(0, 6)}...${address.slice(-4)}`);
        }
        // Also fetch and update positions
        const positionsUrl = `https://data-api.polymarket.com/positions?user=${address}`;
        const positions = yield (0, fetchData_1.default)(positionsUrl);
        if (Array.isArray(positions) && positions.length > 0) {
            for (const position of positions) {
                yield UserPosition.findOneAndUpdate({ asset: position.asset, conditionId: position.conditionId }, {
                    proxyWallet: position.proxyWallet,
                    asset: position.asset,
                    conditionId: position.conditionId,
                    size: position.size,
                    avgPrice: position.avgPrice,
                    initialValue: position.initialValue,
                    currentValue: position.currentValue,
                    cashPnl: position.cashPnl,
                    percentPnl: position.percentPnl,
                    totalBought: position.totalBought,
                    realizedPnl: position.realizedPnl,
                    percentRealizedPnl: position.percentRealizedPnl,
                    curPrice: position.curPrice,
                    redeemable: position.redeemable,
                    mergeable: position.mergeable,
                    title: position.title,
                    slug: position.slug,
                    icon: position.icon,
                    eventSlug: position.eventSlug,
                    outcome: position.outcome,
                    outcomeIndex: position.outcomeIndex,
                    oppositeOutcome: position.oppositeOutcome,
                    oppositeAsset: position.oppositeAsset,
                    endDate: position.endDate,
                    negativeRisk: position.negativeRisk,
                }, { upsert: true });
            }
        }
    }
    catch (error) {
        logger_1.default.error(`Error fetching data for ${address.slice(0, 6)}...${address.slice(-4)}: ${error}`);
    }
});
// Parallel fetch for all traders
const fetchTradeData = () => __awaiter(void 0, void 0, void 0, function* () {
    yield Promise.allSettled(userModels.map(fetchTradeDataForTrader));
});
// Track if this is the first run
let isFirstRun = true;
// Track if monitor should continue running
let isRunning = true;
/**
 * Stop the trade monitor gracefully
 */
const stopTradeMonitor = () => {
    isRunning = false;
    logger_1.default.info('Trade monitor shutdown requested...');
};
exports.stopTradeMonitor = stopTradeMonitor;
const tradeMonitor = () => __awaiter(void 0, void 0, void 0, function* () {
    yield init();
    logger_1.default.success(`Monitoring ${USER_ADDRESSES.length} trader(s) every ${FETCH_INTERVAL}s`);
    logger_1.default.separator();
    // On first run, mark all existing historical trades as already processed
    if (isFirstRun) {
        logger_1.default.info('First run: marking all historical trades as processed...');
        for (const { address, UserActivity } of userModels) {
            const count = yield UserActivity.updateMany({ bot: false }, { $set: { bot: true, botExcutedTime: 999 } });
            if (count.modifiedCount > 0) {
                logger_1.default.info(`Marked ${count.modifiedCount} historical trades as processed for ${address.slice(0, 6)}...${address.slice(-4)}`);
            }
        }
        isFirstRun = false;
        logger_1.default.success('\nHistorical trades processed. Now monitoring for new trades only.');
        logger_1.default.separator();
    }
    while (isRunning) {
        yield fetchTradeData();
        if (!isRunning)
            break;
        yield new Promise((resolve) => setTimeout(resolve, FETCH_INTERVAL * 1000));
    }
    logger_1.default.info('Trade monitor stopped');
});
exports.default = tradeMonitor;
