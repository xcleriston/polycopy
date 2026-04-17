var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import connectDB, { closeDB } from './config/db.js';
import { ENV } from './config/env.js';
import tradeExecutor, { stopTradeExecutor } from './services/tradeExecutor.js';
import tradeMonitor, { stopTradeMonitor } from './services/tradeMonitor.js';
import { startChainMonitor, stopChainMonitor } from './services/chainMonitor.js';
import { startWSMonitor, stopWSMonitor } from './services/wsMonitor.js';
import { startTpSlMonitor, stopTpSlMonitor } from './services/tpSlMonitor.js';
import { startArbitrageMonitor, stopArbitrageMonitor } from './services/arbitrageMonitor.js';
import { startServer } from './server/index.js';
import TelegramServer from './telegram/server.js';
import Logger from './utils/logger.js';
import setupProxy from './utils/setupProxy.js';
import { refreshUserStats } from './utils/userStats.js';
import User from './models/user.js';
// Function handles proxy initialization inside main
// Handle Railway port
const PORT = parseInt(process.env.PORT || '3000');
const USER_ADDRESSES = ENV.USER_ADDRESSES;
const PROXY_WALLET = ENV.PROXY_WALLET;
// Graceful shutdown handler
let isShuttingDown = false;
const gracefulShutdown = (signal) => __awaiter(void 0, void 0, void 0, function* () {
    if (isShuttingDown) {
        Logger.warning('Shutdown already in progress, forcing exit...');
        process.exit(1);
    }
    isShuttingDown = true;
    Logger.separator();
    Logger.info(`Received ${signal}, initiating graceful shutdown...`);
    try {
        // Stop all services graciosamente
        stopTradeMonitor();
        stopTradeExecutor();
        stopChainMonitor();
        stopWSMonitor();
        stopTpSlMonitor();
        stopArbitrageMonitor();
        // Give services time to finish current operations
        Logger.info('Waiting for services to finish current operations...');
        yield new Promise((resolve) => setTimeout(resolve, 2000));
        // Close database connection
        yield closeDB();
        Logger.success('Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        Logger.error(`Error during shutdown: ${error}`);
        process.exit(1);
    }
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    Logger.error(`🌪️ UNHANDLED REJECTION at: ${promise}, reason: ${reason}`);
    // Don't exit immediately, let the application try to recover
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    const isNetworkError = error.message.includes('429') ||
        error.message.includes('404') ||
        error.message.includes('Unexpected server response') ||
        error.message.includes('WebSocket') ||
        error.message.includes('Invalid WebSocket frame') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('socket hang up') ||
        error.message.includes('MongoExpiredSessionError');
    if (isNetworkError) {
        Logger.error(`⚠️ Resiliency: Suppression of crash for error: ${error.message}`);
        return; // Don't kill the process for network hiccups or transient mongo session issues
    }
    Logger.error(`Uncaught Exception: ${error.message}`);
    // Exit immediately for other uncaught exceptions as the application is in an undefined state
    gracefulShutdown('uncaughtException').catch(() => {
        process.exit(1);
    });
});
// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
export const main = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        Logger.info('Starting Polycopy SaaS Multi-User System...');
        // 1. First establish DB connection
        yield connectDB();
        // 2. Initialize proxy logic
        yield setupProxy();
        // 3. START SERVER FIRST to satisfy Railway port health checks
        Logger.info(`Starting web server on port ${PORT}...`);
        yield startServer(PORT);
        // 4. Initial Balance Sync (T+0) - Preenche o cache imediatamente (Await crítico)
        const activeUsersCount = yield User.countDocuments({ 'config.enabled': true });
        if (activeUsersCount > 0) {
            Logger.info(`[BOOT] Performing initial balance sync for ${activeUsersCount} users...`);
            const users = yield User.find({ 'config.enabled': true });
            // Usando Promise.all para ser rápido, mas aguardando o fim do lote
            yield Promise.all(users.map(user => refreshUserStats(user._id.toString()).catch(() => { })));
            Logger.success('[BOOT] Initial balance sync completed');
        }
        // 5. Start background monitors in parallel
        const services = [
            { name: 'Trade Monitor', start: tradeMonitor },
            { name: 'Chain Monitor', start: startChainMonitor },
            { name: 'WS Monitor', start: startWSMonitor },
            { name: 'TP/SL Monitor', start: startTpSlMonitor },
            { name: 'Trade Executor', start: tradeExecutor },
            { name: 'Arbitrage Bot', start: startArbitrageMonitor }
        ];
        for (const service of services) {
            Logger.info(`Starting ${service.name}...`);
            // Circuit Breaker: Cada serviço inicia de forma isolada
            Promise.resolve(service.start()).catch((err) => {
                const errMsg = (err === null || err === void 0 ? void 0 : err.message) || err;
                Logger.error(`Failed to start ${service.name}: ${errMsg}`);
            });
        }
        if (ENV.TELEGRAM_BOT_TOKEN) {
            const telegramServer = new TelegramServer(ENV.TELEGRAM_BOT_TOKEN);
            telegramServer.startPolling().catch(err => {
                Logger.error(`Telegram Bot Critical Error: ${err.message || err}`);
            });
        }
        Logger.success('All services initialized and port bound 🚀');
        // 5. Background Balance Sync (Every 10 minutes)
        setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const activeUsers = yield User.find({ 'config.enabled': true });
                Logger.info(`[SYNC] Starting periodic balance refresh for ${activeUsers.length} users...`);
                for (const user of activeUsers) {
                    yield refreshUserStats(user._id.toString());
                }
            }
            catch (err) {
                Logger.error(`[SYNC] Periodic refresh failed: ${err}`);
            }
        }), 10 * 60 * 1000);
    }
    catch (error) {
        Logger.error(`Fatal error during startup: ${error}`);
        // Ensure process exits with 1 so Railway restarts it
        process.exit(1);
    }
});
main();
