var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import mongoose from 'mongoose';
import { ENV } from '../config/env.js';
import getMyBalance from './getMyBalance.js';
import fetchData from './fetchData.js';
import Logger from './logger.js';
export const performHealthCheck = () => __awaiter(void 0, void 0, void 0, function* () {
    const checks = {
        database: { status: 'error', message: 'Not checked' },
        rpc: { status: 'error', message: 'Not checked' },
        balance: { status: 'error', message: 'Not checked' },
        polymarketApi: { status: 'error', message: 'Not checked' },
    };
    // Check MongoDB connection
    try {
        const isConnected = mongoose.connection.readyState === 1;
        if (isConnected) {
            checks.database = { status: 'ok', message: 'MongoDB connected' };
        }
        else {
            checks.database = { status: 'error', message: 'MongoDB disconnected' };
        }
    }
    catch (error) {
        checks.database = { status: 'error', message: `MongoDB error: ${error instanceof Error ? error.message : String(error)}` };
    }
    // Check RPC endpoint
    try {
        const response = yield fetch(ENV.RPC_URL, {
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
        const balance = yield getMyBalance(ENV.PROXY_WALLET);
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
        yield fetchData('https://data-api.polymarket.com/positions?user=0x0000000000000000000000000000000000000000');
        checks.polymarketApi = { status: 'ok', message: 'API responding' };
    }
    catch (error) {
        checks.polymarketApi = { status: 'error', message: `API check failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    const healthy = checks.database.status === 'ok' && checks.rpc.status === 'ok' && checks.balance.status !== 'error' && checks.polymarketApi.status === 'ok';
    return { healthy, checks, timestamp: Date.now() };
});
export const logHealthCheck = (result) => {
    Logger.separator();
    Logger.header('🏥 HEALTH CHECK');
    Logger.info(`Overall Status: ${result.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    Logger.info(`Database: ${result.checks.database.status === 'ok' ? '✅' : '❌'} ${result.checks.database.message}`);
    Logger.info(`RPC: ${result.checks.rpc.status === 'ok' ? '✅' : '❌'} ${result.checks.rpc.message}`);
    Logger.info(`Balance: ${result.checks.balance.status === 'ok' ? '✅' : result.checks.balance.status === 'warning' ? '⚠️' : '❌'} ${result.checks.balance.message}`);
    Logger.info(`Polymarket API: ${result.checks.polymarketApi.status === 'ok' ? '✅' : '❌'} ${result.checks.polymarketApi.message}`);
    Logger.separator();
};
