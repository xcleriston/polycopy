var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import connectDB, { closeDB } from './config/db';
import { ENV } from './config/env';
import createClobClient from './utils/createClobClient';
import tradeExecutor, { stopTradeExecutor } from './services/tradeExecutor';
import tradeMonitor, { stopTradeMonitor } from './services/tradeMonitor';
import { startServer } from './server';
import Logger from './utils/logger';
import { performHealthCheck, logHealthCheck } from './utils/healthCheck';
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
        // Stop services
        stopTradeMonitor();
        stopTradeExecutor();
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
    Logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    // Don't exit immediately, let the application try to recover
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    Logger.error(`Uncaught Exception: ${error.message}`);
    // Exit immediately for uncaught exceptions as the application is in an undefined state
    gracefulShutdown('uncaughtException').catch(() => {
        process.exit(1);
    });
});
// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
export const main = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Private key format validation
        const pk = ENV.PRIVATE_KEY;
        if (!/^[0-9a-fA-F]{64}$/.test(pk)) {
            console.error('\n❌ PRIVATE_KEY must be exactly 64 hex characters (without 0x prefix)\n');
            process.exit(1);
        }
        // Security warning
        const colors = {
            reset: '\x1b[0m',
            red: '\x1b[31m',
            yellow: '\x1b[33m',
            cyan: '\x1b[36m',
        };
        console.log(`\n${colors.red}⚠️  SECURITY: Your private key controls real funds. Never share it.${colors.reset}`);
        console.log(`${colors.yellow}💡 First time running the bot?${colors.reset}`);
        console.log(`   Read the guide: ${colors.cyan}GETTING_STARTED.md${colors.reset}`);
        console.log(`   Run health check: ${colors.cyan}npm run health-check${colors.reset}\n`);
        yield connectDB();
        Logger.startup(USER_ADDRESSES, PROXY_WALLET);
        // Perform initial health check
        Logger.info('Performing initial health check...');
        const healthResult = yield performHealthCheck();
        logHealthCheck(healthResult);
        if (!healthResult.healthy) {
            Logger.warning('Health check failed, but continuing startup...');
        }
        Logger.info('Initializing CLOB client...');
        const clobClient = yield createClobClient();
        Logger.success('CLOB client ready');
        Logger.separator();
        Logger.info('Starting trade monitor...');
        tradeMonitor();
        Logger.info('Starting trade executor...');
        tradeExecutor(clobClient);
        // Start web UI + API server
        startServer(PORT);
    }
    catch (error) {
        Logger.error(`Fatal error during startup: ${error}`);
        yield gracefulShutdown('startup-error');
    }
});
main();
