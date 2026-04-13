import express from 'express';
import swaggerUi from 'swagger-ui-express';
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

import User from '../models/user.js';

app.get('/api/status', async (_req, res) => {
    const mongoose = (await import('mongoose')).default;
    const isConnected = mongoose.connection.readyState === 1;
    const userCount = await User.countDocuments();
    const activeUserCount = await User.countDocuments({ 'config.enabled': true });
    
    res.json({
        running: true,
        dbConnected: isConnected,
        uptime: Math.floor((Date.now() - botStartTime) / 1000),
        previewMode: process.env.PREVIEW_MODE === 'true',
        totalUsers: userCount,
        activeUsers: activeUserCount
    });
});

app.get('/api/config', async (_req, res) => {
    // Return summary of first few users for dashboard overview
    const users = await User.find().limit(5).lean();
    
    const config = {
        global: {
            previewMode: process.env.PREVIEW_MODE === 'true',
            fetchInterval: process.env.FETCH_INTERVAL || '10',
            maxOrderSize: process.env.MAX_ORDER_SIZE_USD || '100.0'
        },
        users: users.map(u => ({
            chatId: u.chatId,
            address: u.wallet?.address,
            trader: u.config?.traderAddress,
            strategy: u.config?.strategy,
            size: u.config?.copySize,
            enabled: u.config?.enabled,
            step: u.step
        }))
    };

    res.json(config);
});

app.get('/api/trades', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const { Activity } = await import('../models/userHistory.js');
        
        const dbTrades = await Activity.find()
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        const trades = dbTrades.map(trade => ({
            ...trade,
            isCopied: trade.bot === true || (trade.processedBy && trade.processedBy.length > 0)
        }));

        res.json(trades);
    } catch (error) {
        console.error('Error fetching trades:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- User Management Endpoints ---
app.get('/api/users', async (_req, res) => {
    try {
        const users = await User.find().lean();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.get('/api/users/:chatId', async (req, res) => {
    try {
        const user = await User.findOne({ chatId: req.params.chatId }).lean();
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

app.post('/api/users/:chatId/config', async (req, res) => {
    try {
        const { config, step } = req.body;
        const update: any = {};
        if (config) {
            Object.keys(config).forEach(key => {
                update[`config.${key}`] = config[key];
            });
        }
        if (step) update.step = step;

        const user = await User.findOneAndUpdate(
            { chatId: req.params.chatId },
            { $set: update },
            { new: true }
        );
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.post('/api/users/:chatId/reset', async (req, res) => {
    try {
        const user = await User.findOneAndUpdate(
            { chatId: req.params.chatId },
            { 
                $set: { 
                    step: 'welcome',
                    wallet: undefined,
                    'config.traderAddress': '',
                    'config.enabled': false
                } 
            },
            { new: true }
        );
        res.json({ success: true, message: 'User reset successfully', user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset user' });
    }
});

app.delete('/api/users/:chatId', async (req, res) => {
    try {
        await User.deleteOne({ chatId: req.params.chatId });
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// --- Setup Endpoints (Legacy/Single) ---
app.post('/api/setup', async (req, res) => {
    try {
        const result = await setupNewUser(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Setup failed'
        });
    }
});

app.get('/api/setup/wallet', async (req, res) => {
    try {
        const { ethers } = await import('ethers');
        const wallet = ethers.Wallet.createRandom();
        res.json({
            address: wallet.address,
            privateKey: wallet.privateKey
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to create wallet'
        });
    }
});

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

app.post('/api/config/advanced', async (req, res) => {
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
        const fs = await import('fs');
        const path = await import('path');
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
            } else {
                envContent += `\n${key}='${value}'`;
            }
        });

        fs.writeFileSync(envPath, envContent);
        
        res.json({
            success: true,
            message: 'Configuration updated successfully',
            config: updates
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update configuration'
        });
    }
});

app.post('/api/config/reset', async (_req, res) => {
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

        const fs = await import('fs');
        const path = await import('path');
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
            } else {
                envContent += `\n${key}='${value}'`;
            }
        });

        fs.writeFileSync(envPath, envContent);
        
        res.json({
            success: true,
            message: 'Configuration reset to defaults',
            config: defaults
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to reset configuration'
        });
    }
});

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
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PolyCopy SaaS Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0b0e14;
  --card: #151921;
  --border: #262c36;
  --text: #e1e7ef;
  --text-dim: #94a3b8;
  --accent: #3b82f6;
  --accent-glow: rgba(59, 130, 246, 0.4);
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
}
* { margin:0; padding:0; box-sizing:border-box; font-family: 'Outfit', sans-serif; }
body { background: var(--bg); color: var(--text); padding: 24px; line-height: 1.5; }
.container { max-width: 1400px; margin: 0 auto; }

header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
h1 { font-size: 1.8rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 12px; }
.logo-icon { width: 32px; height: 32px; background: var(--accent); border-radius: 8px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 20px var(--accent-glow); }

.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 32px; }
.stat-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 24px; position: relative; overflow: hidden; }
.stat-card::after { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(45deg, transparent, rgba(59, 130, 246, 0.05)); pointer-events: none; }
.stat-label { color: var(--text-dim); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
.stat-value { font-size: 2rem; font-weight: 700; color: #fff; }
.stat-sub { font-size: 0.8rem; color: var(--success); margin-top: 4px; display: flex; align-items: center; gap: 4px; }

.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
h2 { font-size: 1.25rem; color: #fff; font-weight: 600; }

.card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; margin-bottom: 32px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; padding: 16px; color: var(--text-dim); font-size: 0.85rem; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border); }
td { padding: 16px; border-bottom: 1px solid var(--border); font-size: 0.95rem; }
tr:hover { background: rgba(255,255,255,0.02); }

.user-id { display: flex; align-items: center; gap: 8px; }
.avatar { width: 32px; height: 32px; background: #2d3748; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; }
.badge { padding: 4px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 600; }
.badge-ready { background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.2); }
.badge-setup { background: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2); }

.switch { position: relative; display: inline-block; width: 44px; height: 24px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #333; transition: .4s; border-radius: 34px; }
.slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
input:checked + .slider { background-color: var(--accent); }
input:checked + .slider:before { transform: translateX(20px); }

.action-btn { background: #262c36; color: #fff; border: 1px solid #333; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 0.8rem; margin-right: 4px; transition: 0.2s; }
.action-btn:hover { border-color: var(--accent); color: var(--accent); }
.btn-reset { color: var(--warning); }
.btn-delete { color: var(--danger); }

/* Animation */
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.animate { animation: fadeIn 0.4s ease-out forwards; }

.modal { display: none; position: fixed; z-index: 100; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); backdrop-filter: blur(4px); }
.modal-content { background: var(--card); margin: 10% auto; padding: 32px; border: 1px solid var(--border); width: 500px; border-radius: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
.form-group { margin-bottom: 16px; }
label { display: block; color: var(--text-dim); font-size: 0.85rem; margin-bottom: 8px; }
input, select { width: 100%; background: var(--bg); border: 1px solid var(--border); color: #fff; padding: 12px; border-radius: 8px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.save-btn { background: var(--accent); color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1><div class="logo-icon">P</div> PolyCopy SaaS</h1>
    <div id="uptime" style="color: var(--text-dim); font-size: 0.9rem;">Uptime: ...</div>
  </header>

  <div class="stats-grid">
    <div class="stat-card animate">
      <div class="stat-label">Total de Usuários</div>
      <div id="st-users" class="stat-value">0</div>
      <div class="stat-sub"><span>↑</span> Registrados</div>
    </div>
    <div class="stat-card animate" style="animation-delay: 0.1s">
      <div class="stat-label">Usuários Ativos</div>
      <div id="st-active" class="stat-value">0</div>
      <div class="stat-sub"><span>◉</span> Trading agora</div>
    </div>
    <div class="stat-card animate" style="animation-delay: 0.2s">
      <div class="stat-label">Traders Monitorados</div>
      <div id="st-traders" class="stat-value">0</div>
      <div class="stat-sub"><span>◉</span> Unique traders</div>
    </div>
    <div class="stat-card animate" style="animation-delay: 0.3s">
      <div class="stat-label">Modo do Sistema</div>
      <div id="st-mode" class="stat-value" style="font-size: 1.5rem">PREVIEW</div>
      <div id="st-mode-sub" class="stat-sub">Safe mode active</div>
    </div>
  </div>

  <div class="section-header">
    <h2>Gerenciar Usuários</h2>
  </div>

  <div class="card animate" style="animation-delay: 0.4s">
    <table id="user-table">
      <thead>
        <tr>
          <th>Usuário (Telegram)</th>
          <th>Carteira (Bot)</th>
          <th>Trader Seguido</th>
          <th>Estratégia</th>
          <th>Status</th>
          <th>Ativo?</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody id="user-body">
        <tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-dim);">Carregando usuários...</td></tr>
      </tbody>
    </table>
  </div>

  <div class="section-header">
    <h2>Trades Globais Recentes</h2>
  </div>
  <div class="card animate" style="animation-delay: 0.5s">
    <table id="trade-table">
      <thead>
        <tr>
          <th>Horário</th>
          <th>Follower</th>
          <th>Trader</th>
          <th>Lado</th>
          <th>Valor</th>
          <th>Mercado</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody id="trade-body"></tbody>
    </table>
  </div>
</div>

<!-- Modal Edit User -->
<div id="edit-modal" class="modal">
  <div class="modal-content">
    <h2 style="margin-bottom: 24px;">Editar Configuração de Usuário</h2>
    <input type="hidden" id="edit-chatid">
    <div class="form-group">
      <label>Trader Monitorado</label>
      <input type="text" id="edit-trader">
    </div>
    <div class="form-group">
      <label>Estratégia</label>
      <select id="edit-strategy">
        <option value="PERCENTAGE">Porcentagem (%)</option>
        <option value="FIXED">Valor Fixo ($)</option>
        <option value="ADAPTIVE">Adaptiva</option>
      </select>
    </div>
    <div class="form-group">
      <label>Tamanho (Copy Size)</label>
      <input type="number" id="edit-size" step="0.1">
    </div>
    <div class="modal-footer">
      <button class="action-btn" onclick="closeModal()">Cancelar</button>
      <button class="save-btn" onclick="saveUserConfig()">Salvar Alterações</button>
    </div>
  </div>
</div>

<script>
async function refresh() {
  try {
    const [status, users, trades] = await Promise.all([
      fetch('/api/status').then(r => r.json()),
      fetch('/api/users').then(r => r.json()),
      fetch('/api/trades?limit=10').then(r => r.json())
    ]);

    document.getElementById('uptime').textContent = 'Uptime: ' + Math.floor(status.uptime/3600) + 'h ' + Math.floor((status.uptime%3600)/60) + 'm';
    document.getElementById('st-users').textContent = status.totalUsers;
    document.getElementById('st-active').textContent = status.activeUsers;
    
    // Count unique traders
    const tradersSet = new Set(users.map(u => u.config?.traderAddress).filter(a => !!a));
    document.getElementById('st-traders').textContent = tradersSet.size;
    
    const modeEl = document.getElementById('st-mode');
    const modeSubEl = document.getElementById('st-mode-sub');
    if (status.previewMode) {
      modeEl.textContent = 'PREVIEW';
      modeEl.style.color = 'var(--text)';
      modeSubEl.textContent = 'Modo seguro ativo';
      modeSubEl.style.color = 'var(--success)';
    } else {
      modeEl.textContent = 'REAL TRADES';
      modeEl.style.color = 'var(--accent)';
      modeSubEl.textContent = 'Execução real ativa';
      modeSubEl.style.color = 'var(--danger)';
    }

    // Update Users
    const userBody = document.getElementById('user-body');
    userBody.innerHTML = users.map(u => {
      const isReady = u.step === 'ready';
      return \`
        <tr>
          <td>
            <div class="user-id">
              <div class="avatar">\${u.chatId.slice(-2)}</div>
              <span>\${u.chatId}</span>
            </div>
          </td>
          <td style="font-family: monospace; font-size: 0.8rem">\${u.wallet?.address ? u.wallet.address.slice(0,6)+'...'+u.wallet.address.slice(-4) : '---'}</td>
          <td style="font-family: monospace; font-size: 0.8rem">\${u.config?.traderAddress ? u.config.traderAddress.slice(0,6)+'...'+u.config.traderAddress.slice(-4) : '---'}</td>
          <td>\${u.config?.strategy || '---'} (\${u.config?.copySize || 0}%)</td>
          <td><span class="badge \${isReady ? 'badge-ready' : 'badge-setup'}">\${u.step}</span></td>
          <td>
            <label class="switch">
              <input type="checkbox" \${u.config?.enabled ? 'checked' : ''} onchange="toggleUser('\${u.chatId}', this.checked)">
              <span class="slider"></span>
            </label>
          </td>
          <td>
            <button class="action-btn" onclick="openEditModal('\${u.chatId}', '\${u.config?.traderAddress}', '\${u.config?.strategy}', \${u.config?.copySize})">🔧</button>
            <button class="action-btn btn-reset" onclick="resetUser('\${u.chatId}')">🔄</button>
            <button class="action-btn btn-delete" onclick="deleteUser('\${u.chatId}')">🗑️</button>
          </td>
        </tr>
      \`;
    }).join('');

    // Update Trades
    const tradeBody = document.getElementById('trade-body');
    tradeBody.innerHTML = trades.map(t => \`
      <tr>
        <td style="color: var(--text-dim); font-size: 0.8rem">\${new Date(t.timestamp).toLocaleTimeString()}</td>
        <td>\${t.processedBy?.length > 0 ? t.processedBy.join(', ') : '---'}</td>
        <td style="font-family: monospace; font-size: 0.8rem">\${t.traderAddress.slice(0,6)}...</td>
        <td><span style="color: \${t.side === 'BUY' ? 'var(--success)' : 'var(--danger)'}">\${t.side}</span></td>
        <td>$\${(t.usdcSize || 0).toFixed(2)}</td>
        <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">\${t.title || t.slug}</td>
        <td>\${t.bot ? '<span style="color: var(--success)">✓ Executado</span>' : '<span style="color: var(--text-dim)">Pendente</span>'}</td>
      </tr>
    \`).join('');

  } catch (e) {
    console.error('Refresh error:', e);
  }
}

async function toggleUser(chatId, enabled) {
  await fetch(\`/api/users/\${chatId}/config\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: { enabled } })
  });
  refresh();
}

async function resetUser(chatId) {
  if (!confirm('Deseja resetar este usuário? A carteira será removida e ele voltará ao início.')) return;
  await fetch(\`/api/users/\${chatId}/reset\`, { method: 'POST' });
  refresh();
}

async function deleteUser(chatId) {
  if (!confirm('Deseja excluir permanentemente este usuário?')) return;
  await fetch(\`/api/users/\${chatId}\`, { method: 'DELETE' });
  refresh();
}

function openEditModal(chatId, trader, strategy, size) {
  document.getElementById('edit-chatid').value = chatId;
  document.getElementById('edit-trader').value = trader;
  document.getElementById('edit-strategy').value = strategy;
  document.getElementById('edit-size').value = size;
  document.getElementById('edit-modal').style.display = 'block';
}

function closeModal() {
  document.getElementById('edit-modal').style.display = 'none';
}

async function saveUserConfig() {
  const chatId = document.getElementById('edit-chatid').value;
  const config = {
    traderAddress: document.getElementById('edit-trader').value,
    strategy: document.getElementById('edit-strategy').value,
    copySize: parseFloat(document.getElementById('edit-size').value)
  };
  
  await fetch(\`/api/users/\${chatId}/config\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config })
  });
  
  closeModal();
  refresh();
}

refresh();
setInterval(refresh, 5000);
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

export const startServer = (port: number = parseInt(process.env.PORT || '3000')) => {
    botStartTime = Date.now();
    app.listen(port, '0.0.0.0', () => {
        console.log(`\n🌐 Web UI:  http://0.0.0.0:${port}`);
        console.log(`📖 Swagger: http://0.0.0.0:${port}/docs`);
        console.log(`🔌 API:     http://0.0.0.0:${port}/api/health\n`);
    });
};

export default app;
