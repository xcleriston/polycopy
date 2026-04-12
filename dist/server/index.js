var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { getDbDir } from '../config/db.js';
import * as fs from 'fs';
import * as path from 'path';
import { setupNewUser } from './setup.js';
const app = express();
app.use(express.json());
// --- Swagger API Docs ---
const swaggerDoc = {
    openapi: '3.0.0',
    info: { title: 'PolyCopy API', version: '2.0.0', description: 'Monitor and manage your copy trading bot' },
    paths: {
        '/api/health': { get: { summary: 'Health check', tags: ['System'], responses: { 200: { description: 'OK' } } } },
        '/api/status': { get: { summary: 'Bot status', tags: ['Bot'], responses: { 200: { description: 'Bot running status' } } } },
        '/api/config': { get: { summary: 'Current configuration', tags: ['Config'], responses: { 200: { description: 'Config values' } } } },
        '/api/trades': { get: { summary: 'Recent trades', tags: ['Trading'], parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }], responses: { 200: { description: 'Trade list' } } } },
    },
};
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
// --- API Routes ---
let botStartTime = Date.now();
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.floor((Date.now() - botStartTime) / 1000), timestamp: new Date().toISOString() });
});
app.get('/api/status', (_req, res) => {
    const dbDir = getDbDir();
    const dbFiles = fs.existsSync(dbDir) ? fs.readdirSync(dbDir).filter(f => f.endsWith('.db')) : [];
    res.json({
        running: true,
        uptime: Math.floor((Date.now() - botStartTime) / 1000),
        dataFiles: dbFiles.length,
        previewMode: process.env.PREVIEW_MODE === 'true',
    });
});
app.get('/api/config', (_req, res) => {
    // Try to get Telegram user config first
    let telegramConfig = null;
    try {
        const usersPath = path.join(process.cwd(), 'data', 'telegram_users.json');
        if (fs.existsSync(usersPath)) {
            const usersData = fs.readFileSync(usersPath, 'utf-8');
            const users = JSON.parse(usersData);
            if (users.length > 0) {
                const latestUser = users[users.length - 1];
                if (latestUser.config && latestUser.wallet) {
                    telegramConfig = {
                        walletAddress: latestUser.wallet.address,
                        traderAddress: latestUser.config.traderAddress,
                        copyStrategy: latestUser.config.strategy,
                        copySize: latestUser.config.copySize,
                        step: latestUser.step,
                        refCode: latestUser.refCode
                    };
                }
            }
        }
    }
    catch (error) {
        console.error('Error reading Telegram config:', error);
    }
    // Fallback to environment variables
    const config = {
        copyStrategy: process.env.COPY_STRATEGY || 'PERCENTAGE',
        copySize: process.env.COPY_SIZE || '10.0',
        maxOrderSize: process.env.MAX_ORDER_SIZE_USD || '100.0',
        minOrderSize: process.env.MIN_ORDER_SIZE_USD || '1.0',
        fetchInterval: process.env.FETCH_INTERVAL || '1',
        slippageTolerance: process.env.SLIPPAGE_TOLERANCE || '0.05',
        dailyLossCap: process.env.DAILY_LOSS_CAP_PCT || '20',
        previewMode: process.env.PREVIEW_MODE || 'false',
        tradeAggregation: process.env.TRADE_AGGREGATION_ENABLED || 'false',
        telegramEnabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
        telegramConfig: telegramConfig
    };
    res.json(config);
});
app.get('/api/trades', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const dbDir = getDbDir();
    const trades = [];
    if (fs.existsSync(dbDir)) {
        for (const file of fs.readdirSync(dbDir).filter(f => f.startsWith('user_activities_'))) {
            try {
                const content = fs.readFileSync(path.join(dbDir, file), 'utf-8');
                content.split('\n').filter(Boolean).forEach(line => {
                    try {
                        const trade = JSON.parse(line);
                        // Include all trades, but mark copied trades
                        if (trade.botExcutedTime && trade.botExcutedTime > 0) {
                            trade.isCopied = true;
                        }
                        else {
                            trade.isCopied = false;
                        }
                        trades.push(trade);
                    }
                    catch ( /* skip malformed */_a) { /* skip malformed */ }
                });
            }
            catch ( /* skip */_a) { /* skip */ }
        }
    }
    trades.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    res.json(trades.slice(0, limit));
});
// --- Setup Endpoints for New Users ---
app.post('/api/setup', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield setupNewUser(req.body);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Setup failed'
        });
    }
}));
app.get('/api/setup/wallet', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { ethers } = yield import('ethers');
        const wallet = ethers.Wallet.createRandom();
        res.json({
            address: wallet.address,
            privateKey: wallet.privateKey
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to create wallet'
        });
    }
}));
// --- Advanced Configuration ---
app.get('/api/config/advanced', (_req, res) => {
    const advancedConfig = {
        copyStrategy: process.env.COPY_STRATEGY || 'PERCENTAGE',
        copySize: process.env.COPY_SIZE || '10.0',
        maxOrderSize: process.env.MAX_ORDER_SIZE_USD || '100.0',
        minOrderSize: process.env.MIN_ORDER_SIZE_USD || '1.0',
        fetchInterval: process.env.FETCH_INTERVAL || '10',
        slippageTolerance: process.env.SLIPPAGE_TOLERANCE || '0.05',
        dailyLossCap: process.env.DAILY_LOSS_CAP_PCT || '20',
        previewMode: process.env.PREVIEW_MODE || 'false',
        tradeAggregation: process.env.TRADE_AGGREGATION_ENABLED || 'false',
        retryLimit: process.env.RETRY_LIMIT || '3',
        requestTimeout: process.env.REQUEST_TIMEOUT_MS || '10000',
        networkRetryLimit: process.env.NETWORK_RETRY_LIMIT || '3',
        tooOldTimestamp: process.env.TOO_OLD_TIMESTAMP || '1',
        clobHttpUrl: process.env.CLOB_HTTP_URL || 'https://clob.polymarket.com/',
        clobWsUrl: process.env.CLOB_WS_URL || 'wss://ws-subscriptions-clob.polymarket.com/ws',
        rpcUrl: process.env.RPC_URL || 'https://poly.api.pocket.network',
        usdcContract: process.env.USDC_CONTRACT_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
    };
    res.json(advancedConfig);
});
app.post('/api/config/advanced', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const config = req.body;
        // Validate and update environment variables
        const updates = {
            'COPY_STRATEGY': config.copyStrategy,
            'COPY_SIZE': config.copySize,
            'MAX_ORDER_SIZE_USD': config.maxOrderSize,
            'MIN_ORDER_SIZE_USD': config.minOrderSize,
            'FETCH_INTERVAL': config.fetchInterval,
            'SLIPPAGE_TOLERANCE': config.slippageTolerance,
            'DAILY_LOSS_CAP_PCT': config.dailyLossCap,
            'PREVIEW_MODE': config.previewMode,
            'TRADE_AGGREGATION_ENABLED': config.tradeAggregation,
            'RETRY_LIMIT': config.retryLimit,
            'REQUEST_TIMEOUT_MS': config.requestTimeout,
            'NETWORK_RETRY_LIMIT': config.networkRetryLimit,
            'TOO_OLD_TIMESTAMP': config.tooOldTimestamp,
            'CLOB_HTTP_URL': config.clobHttpUrl,
            'CLOB_WS_URL': config.clobWsUrl,
            'RPC_URL': config.rpcUrl,
            'USDC_CONTRACT_ADDRESS': config.usdcContract
        };
        // Update .env file
        const fs = yield import('fs');
        const path = yield import('path');
        const envPath = path.join(process.cwd(), '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');
        }
        // Update or add each configuration
        Object.entries(updates).forEach(([key, value]) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}='${value}'`);
            }
            else {
                envContent += `\n${key}='${value}'`;
            }
        });
        fs.writeFileSync(envPath, envContent);
        res.json({
            success: true,
            message: 'Configuration updated successfully',
            config: updates
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update configuration'
        });
    }
}));
app.post('/api/config/reset', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const defaults = {
            'COPY_STRATEGY': 'PERCENTAGE',
            'COPY_SIZE': '10.0',
            'MAX_ORDER_SIZE_USD': '100.0',
            'MIN_ORDER_SIZE_USD': '1.0',
            'FETCH_INTERVAL': '10',
            'SLIPPAGE_TOLERANCE': '0.05',
            'DAILY_LOSS_CAP_PCT': '20',
            'PREVIEW_MODE': 'true',
            'TRADE_AGGREGATION_ENABLED': 'false',
            'RETRY_LIMIT': '3',
            'REQUEST_TIMEOUT_MS': '10000',
            'NETWORK_RETRY_LIMIT': '3',
            'TOO_OLD_TIMESTAMP': '1',
            'CLOB_HTTP_URL': 'https://clob.polymarket.com/',
            'CLOB_WS_URL': 'wss://ws-subscriptions-clob.polymarket.com/ws',
            'RPC_URL': 'https://poly.api.pocket.network',
            'USDC_CONTRACT_ADDRESS': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
        };
        const fs = yield import('fs');
        const path = yield import('path');
        const envPath = path.join(process.cwd(), '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');
        }
        // Reset all to defaults
        Object.entries(defaults).forEach(([key, value]) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}='${value}'`);
            }
            else {
                envContent += `\n${key}='${value}'`;
            }
        });
        fs.writeFileSync(envPath, envContent);
        res.json({
            success: true,
            message: 'Configuration reset to defaults',
            config: defaults
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to reset configuration'
        });
    }
}));
app.get('/setup', (_req, res) => {
    const setupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PolyCopy - Novo Usuário</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#c9d1d9;--accent:#58a6ff;--green:#3fb950;--red:#f85149;--yellow:#d29922}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);padding:20px}
.container{max-width:800px;margin:0 auto}
h1{color:var(--accent);margin-bottom:20px;font-size:1.5em;text-align:center}
.step{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:16px}
.step h3{color:var(--accent);margin-bottom:12px}
.form-group{margin-bottom:16px}
label{display:block;margin-bottom:4px;color:#8b949e;font-size:0.9em}
input,select{width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)}
button{background:var(--accent);color:#fff;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;font-weight:600}
button:hover{background:#4a8eff}
button:disabled{background:#484f58;cursor:not-allowed}
.result{background:#0f4d2f;border:1px solid #2d5a3d;border-radius:4px;padding:12px;margin-top:12px}
.error{background:#4b111a;border:1px solid #6d1f27;border-radius:4px;padding:12px;margin-top:12px}
.wallet-info{background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:12px;margin:12px 0;font-family:monospace;font-size:0.9em}
.links{margin-top:12px}
.links a{display:block;color:var(--accent);text-decoration:none;margin:4px 0}
.links a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="container">
<h1>Polymarket Copy Trading Bot</h1>
<div class="step">
<h3>1. Configurar Trading</h3>
<div class="form-group">
<label>Trader para copiar:</label>
<input type="text" id="traderAddress" placeholder="0x..." value="0x2005d16a84ceefa912d4e380cd32e7ff827875ea">
</div>
<div class="form-group">
<label>Estratégia:</label>
<select id="strategy">
<option value="PERCENTAGE">Porcentagem (10%)</option>
<option value="FIXED">Valor Fixo ($50)</option>
<option value="ADAPTIVE">Adaptiva</option>
</select>
</div>
<div class="form-group">
<label>Valor inicial:</label>
<input type="number" id="initialAmount" placeholder="1000" value="1000">
</div>
</div>

<div class="step">
<h3>2. Gerar Carteira</h3>
<button onclick="generateWallet()">Gerar Nova Carteira</button>
<div id="walletResult"></div>
</div>

<div class="step">
<h3>3. Configurar Telegram (Opcional)</h3>
<div class="form-group">
<label>Token do Bot Telegram:</label>
<input type="text" id="telegramToken" placeholder="123456:ABC-DEF1234...">
</div>
</div>

<div class="step">
<h3>4. Finalizar Setup</h3>
<button onclick="completeSetup()" id="setupBtn">Configurar Bot</button>
<div id="setupResult"></div>
</div>
</div>

<script>
let walletData = null;

async function generateWallet() {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Gerando...';
    
    try {
        const response = await fetch('/api/setup/wallet');
        const data = await response.json();
        
        if (data.address) {
            walletData = data;
            document.getElementById('walletResult').innerHTML = 
                '<div class="wallet-info">' +
                '<strong>Endereço:</strong> ' + data.address + '<br>' +
                '<strong>Chave Privada:</strong> ' + data.privateKey + '<br><br>' +
                '<span style="color: var(--red);">SALVE ESTA CHAVE PRIVADA EM LOCAL SEGURO!</span>' +
                '</div>';
        } else {
            document.getElementById('walletResult').innerHTML = 
                '<div class="error">Erro ao gerar carteira</div>';
        }
    } catch (error) {
        document.getElementById('walletResult').innerHTML = 
            '<div class="error">Erro: ' + error.message + '</div>';
    }
    
    btn.disabled = false;
    btn.textContent = 'Gerar Nova Carteira';
}

async function completeSetup() {
    if (!walletData) {
        alert('Por favor, gere uma carteira primeiro');
        return;
    }
    
    const btn = document.getElementById('setupBtn');
    btn.disabled = true;
    btn.textContent = 'Configurando...';
    
    const setupData = {
        traderAddress: document.getElementById('traderAddress').value,
        strategy: document.getElementById('strategy').value,
        copySize: 10.0,
        telegramToken: document.getElementById('telegramToken').value
    };
    
    try {
        const response = await fetch('/api/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(setupData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('setupResult').innerHTML = 
                '<div class="result">' +
                '<h4>Bot Configurado com Sucesso!</h4>' +
                '<p><strong>Carteira:</strong> ' + result.wallet.address + '</p>' +
                '<p><strong>Trader:</strong> ' + result.config.traderAddress + '</p>' +
                '<p><strong>Estratégia:</strong> ' + result.config.strategy + '</p>' +
                '<p><strong>Modo:</strong> Preview (Seguro)</p>' +
                '<div class="links">' +
                '<strong>Links para Funding:</strong><br>' +
                '<a href="' + result.depositLinks.usdc + '" target="_blank">Bridge USDC para Polygon</a><br>' +
                '<a href="' + result.depositLinks.pol + '" target="_blank">Comprar POL (gás)</a><br>' +
                '<a href="/" target="_blank">Acessar Dashboard</a>' +
                '</div>' +
                '</div>';
        } else {
            document.getElementById('setupResult').innerHTML = 
                '<div class="error">Erro: ' + result.error + '</div>';
        }
    } catch (error) {
        document.getElementById('setupResult').innerHTML = 
            '<div class="error">Erro: ' + error.message + '</div>';
    }
    
    btn.disabled = false;
    btn.textContent = 'Configurar Bot';
}
</script>
</body>
</html>`;
    res.type('html').send(setupHtml);
});
// --- Web UI ---
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PolyCopy</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#c9d1d9;--accent:#58a6ff;--green:#3fb950;--red:#f85149;--yellow:#d29922}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);padding:20px}
.container{max-width:1200px;margin:0 auto}
h1{color:var(--accent);margin-bottom:20px;font-size:1.5em}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px}
.card h3{color:var(--accent);margin-bottom:12px;font-size:0.9em;text-transform:uppercase;letter-spacing:1px}
.stat{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.9em}
.stat:last-child{border:none}
.stat .label{color:#8b949e}
.stat .value{font-weight:600}
.badge{padding:2px 8px;border-radius:12px;font-size:0.8em}
.badge.green{background:#238636;color:#fff}
.badge.yellow{background:#9e6a03;color:#fff}
.badge.red{background:#da3633;color:#fff}
table{width:100%;border-collapse:collapse;font-size:0.85em}
th,td{padding:8px;text-align:left;border-bottom:1px solid var(--border)}
th{color:#8b949e;font-weight:500}
.buy{color:var(--green)}.sell{color:var(--red)}
.links{margin-top:16px;font-size:0.85em}
.links a{color:var(--accent);margin-right:16px;text-decoration:none}
.links a:hover{text-decoration:underline}
#lang{float:right;background:var(--card);color:var(--text);border:1px solid var(--border);padding:4px 8px;border-radius:4px}
</style>
</head>
<body>
<div class="container">
<select id="lang" onchange="setLang(this.value)"><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option></select>
<h1>🤖 PolyCopy</h1>
<div class="grid">
<div class="card" id="status-card"><h3 data-i18n="status">Status</h3><div id="status">Loading...</div></div>
<div class="card" id="config-card"><h3 data-i18n="config">Configuration</h3><div id="config">Loading...</div></div>
</div>
<div class="card"><h3 data-i18n="trades">Recent Trades</h3><div id="trades">Loading...</div></div>
<div class="links">
<a href="/docs" data-i18n="swagger">📖 API Docs (Swagger)</a>
<a href="/api/health">🏥 Health Check</a>
<a href="/api/trades?limit=100">📊 All Trades (JSON)</a>
<a href="/config" style="color: #f85149;">Advanced Configuration</a>
</div>
</div>
<script>
const i18n={en:{status:'Status',config:'Configuration',trades:'Recent Trades',swagger:'📖 API Docs',uptime:'Uptime',running:'Running',preview:'Preview Mode',dataFiles:'Data Files',noTrades:'No trades yet'},zh:{status:'状态',config:'配置',trades:'最近交易',swagger:'📖 API 文档',uptime:'运行时间',running:'运行中',preview:'预览模式',dataFiles:'数据文件',noTrades:'暂无交易'},ja:{status:'ステータス',config:'設定',trades:'最近の取引',swagger:'📖 APIドキュメント',uptime:'稼働時間',running:'実行中',preview:'プレビューモード',dataFiles:'データファイル',noTrades:'取引なし'}};
let lang='en';
function setLang(l){lang=l;document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=i18n[l][e.dataset.i18n]||e.textContent);refresh()}
function fmt(s){const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h>0?h+'h '+m+'m':m+'m '+s%60+'s'}
async function refresh(){
try{
const[st,cfg,tr]=await Promise.all([fetch('/api/status').then(r=>r.json()),fetch('/api/config').then(r=>r.json()),fetch('/api/trades?limit=10').then(r=>r.json())]);
document.getElementById('status').innerHTML='<div class="stat"><span class="label">'+i18n[lang].running+'</span><span class="badge green">?</span></div><div class="stat"><span class="label">'+i18n[lang].uptime+'</span><span class="value">'+fmt(st.uptime)+'</span></div><div class="stat"><span class="label">'+i18n[lang].preview+'</span><span class="value">'+(st.previewMode?'?':'?')+'</span></div><div class="stat"><span class="label">'+i18n[lang].dataFiles+'</span><span class="value">'+st.dataFiles+'</span></div>';
// Display Telegram config if available
let configHtml = '';
if (cfg.telegramConfig) {
  configHtml = '<div class="stat"><span class="label">Telegram Config</span><span class="badge green">\u2713</span></div><div class="stat"><span class="label">Carteira</span><span class="value">'+cfg.telegramConfig.walletAddress.slice(0, 10)+'...'+cfg.telegramConfig.walletAddress.slice(-8)+'</span></div><div class="stat"><span class="label">Trader</span><span class="value">'+cfg.telegramConfig.traderAddress.slice(0, 10)+'...'+cfg.telegramConfig.traderAddress.slice(-8)+'</span></div><div class="stat"><span class="label">Estratégia</span><span class="value">'+cfg.telegramConfig.copyStrategy+' ('+cfg.telegramConfig.copySize+'%)</span></div><div class="stat"><span class="label">Status</span><span class="badge '+ (cfg.telegramConfig.step === 'ready' ? 'green' : 'yellow')+'">'+cfg.telegramConfig.step+'</span></div><div class="stat"><span class="label">Ref Code</span><span class="value">'+(cfg.telegramConfig.refCode || 'N/A')+'</span></div>';
}

// Display system config
configHtml += Object.entries(cfg).filter(([k]) => k !== 'telegramConfig').map(([k,v])=>\`<div class="stat"><span class="label">\${k}</span><span class="value">\${v}</span></div>\`).join('');
document.getElementById('config').innerHTML = configHtml;

if(tr.length===0){document.getElementById('trades').innerHTML='<p style="padding:12px;color:#8b949e">'+i18n[lang].noTrades+'</p>';return}
document.getElementById('trades').innerHTML='<table><tr><th>Time</th><th>Type</th><th>Side</th><th>Amount</th><th>Price</th><th>Market</th></tr>'+tr.map(t=>\`<tr\${t.isCopied?' style="background-color: rgba(56, 139, 253, 0.1);"':''}><td>\${new Date(t.timestamp*1000).toLocaleString()}</td><td>\${t.isCopied?'<span style="color: #58a6ff; font-weight: bold;">COPIED</span>':'Original'}</td><td class="\${(t.side||'').toLowerCase()}">\${t.side||'-'}</td><td>$\${(t.usdcSize||0).toFixed(2)}</td><td>\${(t.price||0).toFixed(4)}</td><td>\${(t.title||t.slug||'-').slice(0,40)}</td></tr>\`).join('')+'</table>';
}catch(e){document.getElementById('status').innerHTML='<span class="badge red">Error</span>'}
}
refresh();setInterval(refresh,5000);
</script>
</body></html>`;
app.get('/', (_req, res) => { res.type('html').send(html); });
app.get('/config', (_req, res) => {
    const configHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PolyCopy - Advanced Configuration</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#c9d1d9;--accent:#58a6ff;--green:#3fb950;--red:#f85149;--yellow:#d29922}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);padding:20px}
.container{max-width:1000px;margin:0 auto}
h1{color:var(--accent);margin-bottom:20px;font-size:1.5em}
h2{color:var(--accent);margin-bottom:16px;font-size:1.2em;border-bottom:1px solid var(--border);padding-bottom:8px}
.section{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:20px}
.form-group{margin-bottom:16px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
label{display:block;margin-bottom:4px;color:#8b949e;font-size:0.9em;font-weight:500}
input,select{width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)}
input:focus,select:focus{border-color:var(--accent);outline:none}
button{background:var(--accent);color:#fff;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;font-weight:600;margin-right:8px;margin-bottom:8px}
button:hover{background:#4a8eff}
button.danger{background:var(--red)}
button.danger:hover{background:#da3633}
button:disabled{background:#484f58;cursor:not-allowed}
.success{background:#0f4d2f;border:1px solid #2d5a3d;border-radius:4px;padding:12px;margin-bottom:16px;color:#3fb950}
.error{background:#4b111a;border:1px solid #6d1f27;border-radius:4px;padding:12px;margin-bottom:16px;color:#f85149}
.warning{background:#692d1a;border:1px solid #8d4f2d;border-radius:4px;padding:12px;margin-bottom:16px;color:#d29922}
.description{color:#8b949e;font-size:0.85em;margin-top:4px}
.links{margin-top:16px}
.links a{color:var(--accent);text-decoration:none;margin-right:16px}
.links a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="container">
<h1>Advanced Configuration</h1>

<div class="warning">
<strong>Warning:</strong> These are advanced settings. Incorrect values may cause the bot to malfunction. Use with caution.
</div>

<div id="message"></div>

<div class="section">
<h2>Trading Strategy</h2>
<div class="form-group">
<label for="copyStrategy">Copy Strategy</label>
<select id="copyStrategy">
<option value="PERCENTAGE">Percentage</option>
<option value="FIXED">Fixed Amount</option>
<option value="ADAPTIVE">Adaptive</option>
</select>
<div class="description">How the bot calculates trade sizes</div>
</div>

<div class="form-row">
<div class="form-group">
<label for="copySize">Copy Size (%)</label>
<input type="number" id="copySize" step="0.1" min="0.1" max="100" value="10.0">
<div class="description">Percentage to copy (for PERCENTAGE strategy)</div>
</div>
<div class="form-group">
<label for="maxOrderSize">Max Order Size (USD)</label>
<input type="number" id="maxOrderSize" step="0.01" min="1" value="100.0">
<div class="description">Maximum amount per trade</div>
</div>
</div>

<div class="form-row">
<div class="form-group">
<label for="minOrderSize">Min Order Size (USD)</label>
<input type="number" id="minOrderSize" step="0.01" min="0.01" value="1.0">
<div class="description">Minimum amount per trade</div>
</div>
<div class="form-group">
<label for="slippageTolerance">Slippage Tolerance</label>
<input type="number" id="slippageTolerance" step="0.01" min="0.01" max="0.5" value="0.05">
<div class="description">Acceptable price deviation (0.05 = 5%)</div>
</div>
</div>

<div class="form-group">
<label for="dailyLossCap">Daily Loss Cap (%)</label>
<input type="number" id="dailyLossCap" step="1" min="1" max="100" value="20">
<div class="description">Stop trading if daily losses exceed this percentage</div>
</div>
</div>

<div class="section">
<h2>Performance & Timing</h2>
<div class="form-row">
<div class="form-group">
<label for="fetchInterval">Fetch Interval (seconds)</label>
<input type="number" id="fetchInterval" step="1" min="1" max="300" value="10">
<div class="description">How often to check for new trades</div>
</div>
<div class="form-group">
<label for="tooOldTimestamp">Max Trade Age (seconds)</label>
<input type="number" id="tooOldTimestamp" step="1" min="1" max="300" value="1">
<div class="description">Ignore trades older than this many seconds</div>
</div>
</div>

<div class="form-row">
<div class="form-group">
<label for="retryLimit">Retry Limit</label>
<input type="number" id="retryLimit" step="1" min="1" max="10" value="3">
<div class="description">Max retry attempts for failed operations</div>
</div>
<div class="form-group">
<label for="requestTimeout">Request Timeout (ms)</label>
<input type="number" id="requestTimeout" step="1000" min="1000" max="60000" value="10000">
<div class="description">Timeout for API requests</div>
</div>
</div>

<div class="form-group">
<label for="networkRetryLimit">Network Retry Limit</label>
<input type="number" id="networkRetryLimit" step="1" min="1" max="10" value="3">
<div class="description">Max retry attempts for network failures</div>
</div>
</div>

<div class="section">
<h2>API Endpoints</h2>
<div class="form-group">
<label for="clobHttpUrl">CLOB HTTP URL</label>
<input type="url" id="clobHttpUrl" value="https://clob.polymarket.com/">
<div class="description">Polymarket CLOB HTTP endpoint</div>
</div>

<div class="form-group">
<label for="clobWsUrl">CLOB WebSocket URL</label>
<input type="url" id="clobWsUrl" value="wss://ws-subscriptions-clob.polymarket.com/ws">
<div class="description">Polymarket CLOB WebSocket endpoint</div>
</div>

<div class="form-group">
<label for="rpcUrl">RPC URL</label>
<input type="url" id="rpcUrl" value="https://poly.api.pocket.network">
<div class="description">Polygon RPC endpoint</div>
</div>

<div class="form-group">
<label for="usdcContract">USDC Contract Address</label>
<input type="text" id="usdcContract" value="0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174">
<div class="description">USDC token contract on Polygon</div>
</div>
</div>

<div class="section">
<h2>Safety & Debug</h2>
<div class="form-group">
<label for="previewMode">
<input type="checkbox" id="previewMode"> Preview Mode (Safe)
</label>
<div class="description">When enabled, trades are logged but not executed</div>
</div>

<div class="form-group">
<label for="tradeAggregation">
<input type="checkbox" id="tradeAggregation"> Enable Trade Aggregation
</label>
<div class="description">Combine multiple small trades into larger ones</div>
</div>
</div>

<div class="section">
<h2>Actions</h2>
<button onclick="saveConfiguration()">Save Configuration</button>
<button onclick="resetToDefaults()" class="danger">Reset to Defaults</button>
<button onclick="loadConfiguration()">Reload Current</button>
<div class="links">
<a href="/">Back to Dashboard</a>
</div>
</div>

</div>

<script>
let currentConfig = {};

async function loadConfiguration() {
    try {
        const response = await fetch('/api/config/advanced');
        currentConfig = await response.json();
        
        // Populate form fields
        Object.keys(currentConfig).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = currentConfig[key] === 'true';
                } else {
                    element.value = currentConfig[key];
                }
            }
        });
        
        showMessage('Configuration loaded successfully', 'success');
    } catch (error) {
        showMessage('Error loading configuration: ' + error.message, 'error');
    }
}

async function saveConfiguration() {
    try {
        const config = {
            copyStrategy: document.getElementById('copyStrategy').value,
            copySize: document.getElementById('copySize').value,
            maxOrderSize: document.getElementById('maxOrderSize').value,
            minOrderSize: document.getElementById('minOrderSize').value,
            slippageTolerance: document.getElementById('slippageTolerance').value,
            dailyLossCap: document.getElementById('dailyLossCap').value,
            fetchInterval: document.getElementById('fetchInterval').value,
            tooOldTimestamp: document.getElementById('tooOldTimestamp').value,
            retryLimit: document.getElementById('retryLimit').value,
            requestTimeout: document.getElementById('requestTimeout').value,
            networkRetryLimit: document.getElementById('networkRetryLimit').value,
            clobHttpUrl: document.getElementById('clobHttpUrl').value,
            clobWsUrl: document.getElementById('clobWsUrl').value,
            rpcUrl: document.getElementById('rpcUrl').value,
            usdcContract: document.getElementById('usdcContract').value,
            previewMode: document.getElementById('previewMode').checked.toString(),
            tradeAggregation: document.getElementById('tradeAggregation').checked.toString()
        };

        const response = await fetch('/api/config/advanced', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const result = await response.json();
        
        if (result.success) {
            showMessage('Configuration saved successfully! Bot restart may be required for some changes.', 'success');
            currentConfig = config;
        } else {
            showMessage('Error saving configuration: ' + result.error, 'error');
        }
    } catch (error) {
        showMessage('Error saving configuration: ' + error.message, 'error');
    }
}

async function resetToDefaults() {
    if (!confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch('/api/config/reset', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            showMessage('Configuration reset to defaults! Bot restart may be required.', 'success');
            await loadConfiguration();
        } else {
            showMessage('Error resetting configuration: ' + result.error, 'error');
        }
    } catch (error) {
        showMessage('Error resetting configuration: ' + error.message, 'error');
    }
}

function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.innerHTML = '<div class="' + type + '">' + text + '</div>';
    setTimeout(() => {
        messageDiv.innerHTML = '';
    }, 5000);
}

// Load configuration on page load
loadConfiguration();
</script>
</body>
</html>`;
    res.type('html').send(configHtml);
});
export const startServer = (port = parseInt(process.env.PORT || '3000')) => {
    botStartTime = Date.now();
    app.listen(port, '0.0.0.0', () => {
        console.log(`\n🌐 Web UI:  http://0.0.0.0:${port}`);
        console.log(`📖 Swagger: http://0.0.0.0:${port}/docs`);
        console.log(`🔌 API:     http://0.0.0.0:${port}/api/health\n`);
    });
};
export default app;
