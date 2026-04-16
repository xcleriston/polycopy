import connectDB, { closeDB } from './config/db.js';
import { ENV } from './config/env.js';
import createClobClient from './utils/createClobClient.js';
import tradeExecutor, { stopTradeExecutor } from './services/tradeExecutor.js';
import tradeMonitor, { stopTradeMonitor } from './services/tradeMonitor.js';
import { startChainMonitor } from './services/chainMonitor.js';
import { startWSMonitor } from './services/wsMonitor.js';
import { startTpSlMonitor } from './services/tpSlMonitor.js';
import { startArbitrageMonitor } from './services/arbitrageMonitor.js';
import { startServer } from './server/index.js';
import TelegramServer from './telegram/server.js';
import Logger from './utils/logger.js';
import { performHealthCheck, logHealthCheck } from './utils/healthCheck.js';
import setupProxy from './utils/setupProxy.js';

// Function handles proxy initialization inside main

// Handle Railway port
const PORT = parseInt(process.env.PORT || '3000');

const USER_ADDRESSES = ENV.USER_ADDRESSES;
const PROXY_WALLET = ENV.PROXY_WALLET;

// Graceful shutdown handler
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
        Logger.warning('Shutdown already in progress, forcing exit...');
        process.exit(1);
    }

    isShuttingDown = true;
    Logger.separator();
    Logger.info(`Received ${signal}, initiating graceful shutdown...`);

    try {
        // Stop services
        stopTradeMonitor();
        stopTradeExecutor();

        // Give services time to finish current operations
        Logger.info('Waiting for services to finish current operations...');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Close database connection
        await closeDB();

        Logger.success('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        Logger.error(`Error during shutdown: ${error}`);
        process.exit(1);
    }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    Logger.error(`🌪️ UNHANDLED REJECTION at: ${promise}, reason: ${reason}`);
    // Don't exit immediately, let the application try to recover
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    const isNetworkError = error.message.includes('429') || 
                          error.message.includes('Unexpected server response: 429') ||
                          error.message.includes('Invalid WebSocket frame') || 
                          error.message.includes('ECONNRESET') ||
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

export const main = async () => {
    try {
        Logger.info('Starting Polycopy SaaS Multi-User System...');
        
        // 1. First establish DB connection
        await connectDB();
        
        // 2. Initialize proxy logic
        await setupProxy();

        // 3. START SERVER FIRST to satisfy Railway port health checks
        Logger.info(`Starting web server on port ${PORT}...`);
        await startServer(PORT);
        
        // 4. Start background monitors sequentially with error suppression
        const services = [
            { name: 'Trade Monitor', start: tradeMonitor },
            { name: 'Chain Monitor', start: startChainMonitor },
            { name: 'WS Monitor', start: startWSMonitor },
            { name: 'TP/SL Monitor', start: startTpSlMonitor },
            { name: 'Trade Executor', start: tradeExecutor },
            { name: 'Arbitrage Bot', start: startArbitrageMonitor }
        ];

        for (const service of services) {
            try {
                Logger.info(`Starting ${service.name}...`);
                await service.start();
            } catch (err) {
                Logger.error(`Failed to start ${service.name}: ${err}`);
                // Continue starting other services
            }
        }

        if (ENV.TELEGRAM_BOT_TOKEN) {
            const telegramServer = new TelegramServer(ENV.TELEGRAM_BOT_TOKEN);
            telegramServer.startPolling().catch(err => {
                Logger.error(`Telegram Bot Critical Error: ${err.message || err}`);
            });
        }
        
        Logger.success('All services initialized and port bound 🚀');
    } catch (error) {
        Logger.error(`Fatal error during startup: ${error}`);
        // Ensure process exits with 1 so Railway restarts it
        process.exit(1);
    }
};

main();
