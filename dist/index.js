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
exports.main = void 0;
const db_1 = __importStar(require("./config/db"));
const env_1 = require("./config/env");
const createClobClient_1 = __importDefault(require("./utils/createClobClient"));
const tradeExecutor_1 = __importStar(require("./services/tradeExecutor"));
const tradeMonitor_1 = __importStar(require("./services/tradeMonitor"));
const server_1 = require("./server");
const logger_1 = __importDefault(require("./utils/logger"));
const healthCheck_1 = require("./utils/healthCheck");
// Handle Railway port
const PORT = parseInt(process.env.PORT || '3000');
const USER_ADDRESSES = env_1.ENV.USER_ADDRESSES;
const PROXY_WALLET = env_1.ENV.PROXY_WALLET;
// Graceful shutdown handler
let isShuttingDown = false;
const gracefulShutdown = (signal) => __awaiter(void 0, void 0, void 0, function* () {
    if (isShuttingDown) {
        logger_1.default.warning('Shutdown already in progress, forcing exit...');
        process.exit(1);
    }
    isShuttingDown = true;
    logger_1.default.separator();
    logger_1.default.info(`Received ${signal}, initiating graceful shutdown...`);
    try {
        // Stop services
        (0, tradeMonitor_1.stopTradeMonitor)();
        (0, tradeExecutor_1.stopTradeExecutor)();
        // Give services time to finish current operations
        logger_1.default.info('Waiting for services to finish current operations...');
        yield new Promise((resolve) => setTimeout(resolve, 2000));
        // Close database connection
        yield (0, db_1.closeDB)();
        logger_1.default.success('Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        logger_1.default.error(`Error during shutdown: ${error}`);
        process.exit(1);
    }
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger_1.default.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    // Don't exit immediately, let the application try to recover
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger_1.default.error(`Uncaught Exception: ${error.message}`);
    // Exit immediately for uncaught exceptions as the application is in an undefined state
    gracefulShutdown('uncaughtException').catch(() => {
        process.exit(1);
    });
});
// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Private key format validation
        const pk = env_1.ENV.PRIVATE_KEY;
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
        yield (0, db_1.default)();
        logger_1.default.startup(USER_ADDRESSES, PROXY_WALLET);
        // Perform initial health check
        logger_1.default.info('Performing initial health check...');
        const healthResult = yield (0, healthCheck_1.performHealthCheck)();
        (0, healthCheck_1.logHealthCheck)(healthResult);
        if (!healthResult.healthy) {
            logger_1.default.warning('Health check failed, but continuing startup...');
        }
        logger_1.default.info('Initializing CLOB client...');
        const clobClient = yield (0, createClobClient_1.default)();
        logger_1.default.success('CLOB client ready');
        logger_1.default.separator();
        logger_1.default.info('Starting trade monitor...');
        (0, tradeMonitor_1.default)();
        logger_1.default.info('Starting trade executor...');
        (0, tradeExecutor_1.default)(clobClient);
        // Start web UI + API server
        (0, server_1.startServer)(PORT);
    }
    catch (error) {
        logger_1.default.error(`Fatal error during startup: ${error}`);
        yield gracefulShutdown('startup-error');
    }
});
exports.main = main;
(0, exports.main)();
