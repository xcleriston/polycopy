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
exports.logHealthCheck = exports.performHealthCheck = void 0;
const fs = __importStar(require("fs"));
const env_1 = require("../config/env");
const db_1 = require("../config/db");
const getMyBalance_1 = __importDefault(require("./getMyBalance"));
const fetchData_1 = __importDefault(require("./fetchData"));
const logger_1 = __importDefault(require("./logger"));
const performHealthCheck = () => __awaiter(void 0, void 0, void 0, function* () {
    const checks = {
        database: { status: 'error', message: 'Not checked' },
        rpc: { status: 'error', message: 'Not checked' },
        balance: { status: 'error', message: 'Not checked' },
        polymarketApi: { status: 'error', message: 'Not checked' },
    };
    // Check NeDB data directory
    try {
        const dbDir = (0, db_1.getDbDir)();
        if (fs.existsSync(dbDir)) {
            checks.database = { status: 'ok', message: `NeDB directory: ${dbDir}` };
        }
        else {
            fs.mkdirSync(dbDir, { recursive: true });
            checks.database = { status: 'ok', message: `NeDB directory created: ${dbDir}` };
        }
    }
    catch (error) {
        checks.database = { status: 'error', message: `NeDB error: ${error instanceof Error ? error.message : String(error)}` };
    }
    // Check RPC endpoint
    try {
        const response = yield fetch(env_1.ENV.RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
            signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
            const data = yield response.json();
            checks.rpc = data.result ? { status: 'ok', message: 'RPC endpoint responding' } : { status: 'error', message: 'Invalid RPC response' };
        }
        else {
            checks.rpc = { status: 'error', message: `HTTP ${response.status}` };
        }
    }
    catch (error) {
        checks.rpc = { status: 'error', message: `RPC check failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    // Check USDC balance
    try {
        const balance = yield (0, getMyBalance_1.default)(env_1.ENV.PROXY_WALLET);
        if (balance > 0) {
            checks.balance = balance < 10
                ? { status: 'warning', message: `Low balance: $${balance.toFixed(2)}`, balance }
                : { status: 'ok', message: `Balance: $${balance.toFixed(2)}`, balance };
        }
        else {
            checks.balance = { status: 'error', message: 'Zero balance' };
        }
    }
    catch (error) {
        checks.balance = { status: 'error', message: `Balance check failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    // Check Polymarket API
    try {
        yield (0, fetchData_1.default)('https://data-api.polymarket.com/positions?user=0x0000000000000000000000000000000000000000');
        checks.polymarketApi = { status: 'ok', message: 'API responding' };
    }
    catch (error) {
        checks.polymarketApi = { status: 'error', message: `API check failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    const healthy = checks.database.status === 'ok' && checks.rpc.status === 'ok' && checks.balance.status !== 'error' && checks.polymarketApi.status === 'ok';
    return { healthy, checks, timestamp: Date.now() };
});
exports.performHealthCheck = performHealthCheck;
const logHealthCheck = (result) => {
    logger_1.default.separator();
    logger_1.default.header('🏥 HEALTH CHECK');
    logger_1.default.info(`Overall Status: ${result.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    logger_1.default.info(`Database: ${result.checks.database.status === 'ok' ? '✅' : '❌'} ${result.checks.database.message}`);
    logger_1.default.info(`RPC: ${result.checks.rpc.status === 'ok' ? '✅' : '❌'} ${result.checks.rpc.message}`);
    logger_1.default.info(`Balance: ${result.checks.balance.status === 'ok' ? '✅' : result.checks.balance.status === 'warning' ? '⚠️' : '❌'} ${result.checks.balance.message}`);
    logger_1.default.info(`Polymarket API: ${result.checks.polymarketApi.status === 'ok' ? '✅' : '❌'} ${result.checks.polymarketApi.message}`);
    logger_1.default.separator();
};
exports.logHealthCheck = logHealthCheck;
