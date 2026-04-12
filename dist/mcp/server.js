#!/usr/bin/env node
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
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DATA_DIR = path.join(process.cwd(), 'data');
const readDbFile = (filename) => {
    const fp = path.join(DATA_DIR, filename);
    if (!fs.existsSync(fp))
        return [];
    return fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean).map(line => {
        try {
            return JSON.parse(line);
        }
        catch (_a) {
            return null;
        }
    }).filter(Boolean);
};
const server = new mcp_js_1.McpServer({ name: 'polycopy', version: '2.0.0' });
server.tool('get_bot_status', 'Get current bot status and uptime', {}, () => __awaiter(void 0, void 0, void 0, function* () {
    const dbFiles = fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.db')) : [];
    return { content: [{ type: 'text', text: JSON.stringify({
                    running: true,
                    dataDir: DATA_DIR,
                    dataFiles: dbFiles.length,
                    previewMode: process.env.PREVIEW_MODE === 'true',
                }, null, 2) }] };
}));
server.tool('get_recent_trades', 'Get recent copy trades', { limit: zod_1.z.number().optional().describe('Max trades to return (default 20)') }, (_a) => __awaiter(void 0, [_a], void 0, function* ({ limit }) {
    const trades = [];
    if (fs.existsSync(DATA_DIR)) {
        for (const f of fs.readdirSync(DATA_DIR).filter(f => f.startsWith('user_activities_'))) {
            trades.push(...readDbFile(f));
        }
    }
    trades.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return { content: [{ type: 'text', text: JSON.stringify(trades.slice(0, limit || 20), null, 2) }] };
}));
server.tool('get_positions', 'Get current tracked positions', {}, () => __awaiter(void 0, void 0, void 0, function* () {
    const positions = [];
    if (fs.existsSync(DATA_DIR)) {
        for (const f of fs.readdirSync(DATA_DIR).filter(f => f.startsWith('user_positions_'))) {
            positions.push(...readDbFile(f));
        }
    }
    return { content: [{ type: 'text', text: JSON.stringify(positions, null, 2) }] };
}));
server.tool('get_config', 'Get current bot configuration', {}, () => __awaiter(void 0, void 0, void 0, function* () {
    return { content: [{ type: 'text', text: JSON.stringify({
                    copyStrategy: process.env.COPY_STRATEGY || 'PERCENTAGE',
                    copySize: process.env.COPY_SIZE || '10.0',
                    maxOrderSize: process.env.MAX_ORDER_SIZE_USD || '100.0',
                    fetchInterval: process.env.FETCH_INTERVAL || '1',
                    slippageTolerance: process.env.SLIPPAGE_TOLERANCE || '0.05',
                    dailyLossCap: process.env.DAILY_LOSS_CAP_PCT || '20',
                    previewMode: process.env.PREVIEW_MODE || 'false',
                }, null, 2) }] };
}));
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    const transport = new stdio_js_1.StdioServerTransport();
    yield server.connect(transport);
});
main().catch(console.error);
