import connectDB, { closeDB } from './config/db.js';
import { ENV } from './config/env.js';
import createClobClient from './utils/createClobClient.js';
import tradeExecutor, { stopTradeExecutor } from './services/tradeExecutor.js';
import tradeMonitor, { stopTradeMonitor } from './services/tradeMonitor.js';
import { startServer } from './server/index.js';
import TelegramServer from './telegram/server.js';
import Logger from './utils/logger.js';
import { performHealthCheck, logHealthCheck } from './utils/healthCheck.js';

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
    Logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    // Don't exit immediately, let the application try to recover
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    Logger.error(`Uncaught Exception: ${error.message}`);
    // Exit immediately for uncaught exceptions as the application is in an undefined state
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
        
        await connectDB();
        
        // Telegram Bot (non-blocking)
        if (ENV.TELEGRAM_BOT_TOKEN) {
            const telegramServer = new TelegramServer(ENV.TELEGRAM_BOT_TOKEN);
            telegramServer.startPolling().catch(err => {
                Logger.error(`Telegram Bot Critical Error: ${err.message || err}`);
            });
        }

        Logger.info('Starting trade monitor...');
        tradeMonitor();

        Logger.info('Starting trade executor...');
        tradeExecutor();

        // Start web UI + API server
        startServer(PORT);
        
        Logger.success('All services initialized 🚀');
    } catch (error) {
        Logger.error(`Fatal error during startup: ${error}`);
        await gracefulShutdown('startup-error');
    }
};

main();
