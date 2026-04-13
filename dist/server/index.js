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
import { setupNewUser } from './setup.js';
import cookieParser from 'cookie-parser';
import { authenticateToken, authorizeAdmin, login, signup } from './auth.js';
import bcrypt from 'bcryptjs';
import User from '../models/user.js';
const app = express();
app.use(express.json());
app.use(cookieParser());
let botStartTime = Date.now();
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
// --- Admin Bootstrap ---
const bootstrapAdmin = () => __awaiter(void 0, void 0, void 0, function* () {
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'hacker123';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@polyhacker.com';
    try {
        let user = yield User.findOne({
            $or: [{ username: adminUser }, { email: adminEmail }]
        });
        const hashedPassword = yield bcrypt.hash(adminPass, 10);
        if (!user) {
            console.log(`🚀 [BOOTSTRAP] Criando Administrador: ${adminUser}`);
            user = new User({
                username: adminUser,
                email: adminEmail,
                password: hashedPassword,
                role: 'admin',
                step: 'ready'
            });
            yield user.save();
        }
        else {
            console.log(`⚡ [BOOTSTRAP] Validando permissões de administrador: ${adminUser}`);
            user.role = 'admin';
            user.password = hashedPassword; // Forçar sincronia com env
            yield user.save();
        }
    }
    catch (error) {
        console.error('❌ [BOOTSTRAP] Erro crítico:', error);
    }
});
// --- API Auth (Public) ---
app.post('/api/auth/login', login);
app.post('/api/auth/signup', signup);
app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('auth_token');
    res.json({ success: true });
});
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.floor((Date.now() - botStartTime) / 1000) });
});
// --- Protect all other /api routes ---
app.use('/api', authenticateToken);
app.get('/api/status', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const mongoose = (yield import('mongoose')).default;
        const totalUsers = yield User.countDocuments();
        const activeUsers = yield User.countDocuments({ 'config.enabled': true });
        res.json({
            running: true,
            dbConnected: mongoose.connection.readyState === 1,
            uptime: Math.floor((Date.now() - botStartTime) / 1000),
            username: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'ANONYMOUS',
            role: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) || 'GUEST',
            totalUsers,
            activeUsers,
            previewMode: process.env.PREVIEW_MODE === 'true'
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
}));
app.get('/api/config', authorizeAdmin, (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Return summary of first few users for dashboard overview
    const users = yield User.find().limit(5).lean();
    const config = {
        global: {
            previewMode: process.env.PREVIEW_MODE === 'true',
            fetchInterval: process.env.FETCH_INTERVAL || '10',
            maxOrderSize: process.env.MAX_ORDER_SIZE_USD || '100.0'
        },
        users: users.map(u => {
            var _a, _b, _c, _d, _e;
            return ({
                chatId: u.chatId,
                address: (_a = u.wallet) === null || _a === void 0 ? void 0 : _a.address,
                trader: (_b = u.config) === null || _b === void 0 ? void 0 : _b.traderAddress,
                strategy: (_c = u.config) === null || _c === void 0 ? void 0 : _c.strategy,
                size: (_d = u.config) === null || _d === void 0 ? void 0 : _d.copySize,
                enabled: (_e = u.config) === null || _e === void 0 ? void 0 : _e.enabled,
                step: u.step
            });
        })
    };
    res.json(config);
}));
app.get('/api/trades', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const { Activity } = yield import('../models/userHistory.js');
        const dbTrades = yield Activity.find()
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
        const trades = dbTrades.map(trade => (Object.assign(Object.assign({}, trade), { isCopied: trade.bot === true || (trade.processedBy && trade.processedBy.length > 0) })));
        res.json(trades);
    }
    catch (error) {
        console.error('Error fetching trades:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}));
app.get('/api/users', authorizeAdmin, (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const users = yield User.find().lean();
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
}));
app.get('/api/users/:chatId', authorizeAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield User.findOne({ chatId: req.params.chatId }).lean();
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
}));
app.post('/api/users/:chatId/config', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { config, step } = req.body;
        const update = {};
        if (config) {
            Object.keys(config).forEach(key => {
                update[`config.${key}`] = config[key];
            });
        }
        if (step)
            update.step = step;
        const user = yield User.findOneAndUpdate({ chatId: req.params.chatId }, { $set: update }, { new: true });
        res.json({ success: true, user });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
}));
app.post('/api/users/:chatId/reset', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield User.findOneAndUpdate({ chatId: req.params.chatId }, {
            $set: {
                step: 'welcome',
                wallet: undefined,
                'config.traderAddress': '',
                'config.enabled': false
            }
        }, { new: true });
        res.json({ success: true, message: 'User reset successfully', user });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to reset user' });
    }
}));
app.delete('/api/users/:chatId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield User.deleteOne({ chatId: req.params.chatId });
        res.json({ success: true, message: 'User deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
}));
app.post('/api/push/subscribe', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { subscription } = req.body;
        yield User.updateOne({ _id: (_a = req.user) === null || _a === void 0 ? void 0 : _a.id }, { $set: { pushSubscription: JSON.stringify(subscription) } });
        res.json({ success: true, message: 'Push subscription saved' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to save subscription' });
    }
}));
// --- Setup Endpoints (Legacy/Single) ---
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
const hackerStyles = `
:root {
  --bg: #050505;
  --card: #0a0a0a;
  --border: #1a1a1a;
  --text: #e0e0e0;
  --text-dim: #808080;
  --accent: #00ff41;
  --accent-blue: #00d1ff;
  --accent-glow: rgba(0, 255, 65, 0.2);
  --danger: #ff003c;
  --warning: #f59e0b;
  --hacker-font: 'JetBrains Mono', monospace;
}
* { margin:0; padding:0; box-sizing:border-box; }
body { 
  background: var(--bg); 
  color: var(--text); 
  font-family: 'Outfit', sans-serif; 
  overflow-x: hidden; 
  background-image: radial-gradient(circle at 50% 50%, #0a0a0a 0%, #050505 100%);
}
.scanline {
  width: 100%;
  height: 100px;
  background: linear-gradient(0deg, rgba(0, 255, 65, 0.03), transparent);
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  pointer-events: none;
  animation: scan 8s linear infinite;
}
@keyframes scan { from { transform: translateY(-100px); } to { transform: translateY(100vh); } }

.glass {
  background: rgba(10, 10, 10, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.hacker-glow { box-shadow: 0 0 15px var(--accent-glow); }
.text-hacker { font-family: var(--hacker-font); color: var(--accent); }
.btn-hacker {
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
  padding: 10px 20px;
  border-radius: 4px;
  font-family: var(--hacker-font);
  cursor: pointer;
  transition: 0.3s;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.btn-hacker:hover {
  background: var(--accent);
  color: #000;
  box-shadow: 0 0 20px var(--accent-glow);
}
`;
const loginHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Poly Hacker | Entry Point</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
  <style>${hackerStyles}
    body { display: flex; align-items: center; justify-content: center; height: 100vh; }
    .auth-card { width: 100%; max-width: 400px; padding: 40px; text-align: center; }
    .logo { font-size: 2rem; font-weight: 800; margin-bottom: 30px; letter-spacing: -1px; }
    .logo span { color: var(--accent); }
    .form-group { text-align: left; margin-bottom: 20px; }
    label { display: block; font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px; font-family: var(--hacker-font); }
    input { width: 100%; background: #000; border: 1px solid #222; padding: 12px; color: #fff; border-radius: 4px; border-left: 3px solid var(--accent); }
    input:focus { border-color: var(--accent); outline: none; }
    .footer { margin-top: 20px; font-size: 0.8rem; color: var(--text-dim); }
    .footer a { color: var(--accent); text-decoration: none; }
  </style>
</head>
<body>
  <div class="scanline"></div>
  <div class="auth-card glass hacker-glow">
    <div class="logo">POLY<span>HACKER</span></div>
    <form id="loginForm">
      <div class="form-group">
        <label>ID / EMAIL / USER</label>
        <input type="text" id="identity" required>
      </div>
      <div class="form-group">
        <label>ACCESS_CODE</label>
        <input type="password" id="password" required>
      </div>
      <button type="submit" class="btn-hacker" style="width: 100%">Execute_Login</button>
    </form>
    <div id="error" style="color: var(--danger); margin-top: 15px; font-size: 0.85rem"></div>
    <div class="footer">
      Não tem acesso? <a href="/signup">Solicitar Credenciais</a>
    </div>
  </div>
  <script>
    document.getElementById('loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const identity = document.getElementById('identity').value;
      const password = document.getElementById('password').value;
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, password })
      });
      const data = await res.json();
      if (data.success) window.location.href = '/';
      else document.getElementById('error').textContent = data.error;
    };
  </script>
</body> </html>`;
const signupHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Poly Hacker | Register</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
  <style>${hackerStyles}
    body { display: flex; align-items: center; justify-content: center; height: 100vh; }
    .auth-card { width: 100%; max-width: 400px; padding: 40px; text-align: center; }
    .logo { font-size: 2rem; font-weight: 800; margin-bottom: 30px; }
    .logo span { color: var(--accent); }
    .form-group { text-align: left; margin-bottom: 20px; }
    label { display: block; font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px; font-family: var(--hacker-font); }
    input { width: 100%; background: #000; border: 1px solid #222; padding: 12px; color: #fff; border-radius: 4px; border-left: 3px solid var(--accent-blue); }
    input:focus { border-color: var(--accent-blue); outline: none; }
    .footer { margin-top: 20px; font-size: 0.8rem; color: var(--text-dim); }
    .footer a { color: var(--accent-blue); text-decoration: none; }
  </style>
</head>
<body>
  <div class="scanline"></div>
  <div class="auth-card glass hacker-glow" style="box-shadow: 0 0 15px rgba(0, 209, 255, 0.2)">
    <div class="logo">POLY<span>HACKER</span></div>
    <form id="signupForm">
      <div class="form-group">
        <label>USERNAME</label>
        <input type="text" id="username" required>
      </div>
      <div class="form-group">
        <label>EMAIL</label>
        <input type="email" id="email" required>
      </div>
      <div class="form-group">
        <label>ACCESS_CODE</label>
        <input type="password" id="password" required>
      </div>
      <button type="submit" class="btn-hacker" style="width: 100%; border-color: var(--accent-blue); color: var(--accent-blue)">Initialize_Account</button>
    </form>
    <div id="error" style="color: var(--danger); margin-top: 15px; font-size: 0.85rem"></div>
    <div class="footer">
      Já possui acesso? <a href="/login">Conectar</a>
    </div>
  </div>
  <script>
    document.getElementById('signupForm').onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();
      if (data.success) window.location.href = '/';
      else document.getElementById('error').textContent = data.error;
    };
  </script>
</body> </html>`;
const dashboardHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PolyCopy SaaS Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0b0e14;
  --sidebar: #151921;
  --card: #1c212b;
  --border: #2d343f;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --accent: #3b82f6;
  --accent-glow: rgba(59, 130, 246, 0.4);
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --font-main: 'Outfit', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
* { margin:0; padding:0; box-sizing:border-box; }
body { background: var(--bg); color: var(--text); font-family: var(--font-main); display: flex; min-height: 100vh; overflow-x: hidden; }

/* Sidebar */
aside { width: 260px; background: var(--sidebar); border-right: 1px solid var(--border); display: flex; flex-direction: column; position: fixed; height: 100vh; transition: 0.3s; z-index: 1000; }
.logo { padding: 30px; font-size: 1.5rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--border); }
.logo span { color: var(--accent); }
.nav { flex: 1; padding: 20px 0; }
.nav-item { padding: 12px 300px; color: var(--text-dim); cursor: pointer; display: flex; align-items: center; gap: 12px; transition: 0.2s; font-weight: 500; font-size: 0.95rem; }
.nav-item:hover { color: #fff; background: rgba(255,255,255,0.03); }
.nav-item.active { color: #fff; background: rgba(59, 130, 246, 0.1); border-left: 3px solid var(--accent); }

/* Main Content */
main { flex: 1; margin-left: 260px; padding: 40px; width: calc(100% - 260px); }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
.user-info { display: flex; align-items: center; gap: 12px; }
.avatar { width: 35px; height: 35px; background: var(--accent); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; box-shadow: 0 0 15px var(--accent-glow); }

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; margin-bottom: 40px; }
.stat-card { background: var(--card); border: 1px solid var(--border); padding: 24px; border-radius: 16px; position: relative; overflow: hidden; }
.stat-card::after { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(45deg, transparent, rgba(59, 130, 246, 0.03)); pointer-events: none; }
.stat-label { color: var(--text-dim); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
.stat-value { font-size: 2rem; font-weight: 700; color: #fff; }
.stat-sub { font-size: 0.8rem; margin-top: 8px; font-family: var(--font-mono); }

/* Tables & Content */
.section { display: none; width: 100%; }
.section.active { display: block; animation: fadeIn 0.4s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; margin-bottom: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
h2 { margin-bottom: 24px; font-size: 1.25rem; font-weight: 700; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; padding: 16px 24px; color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border); letter-spacing: 1px; }
td { padding: 16px 24px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
tr:hover { background: rgba(59, 130, 246, 0.02); }

/* Badges & Buttons */
.badge { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; font-family: var(--font-mono); }
.badge-ready { background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.2); }
.badge-setup { background: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2); }

.switch { position: relative; display: inline-block; width: 42px; height: 22px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #334155; transition: .4s; border-radius: 34px; }
.slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
input:checked + .slider { background-color: var(--accent); }
input:checked + .slider:before { transform: translateX(20px); }

.btn { background: #2d343f; color: #fff; border: 1px solid var(--border); padding: 8px 14px; border-radius: 8px; cursor: pointer; transition: 0.2s; font-size: 0.85rem; font-weight: 600; }
.btn:hover { border-color: var(--accent); color: var(--accent); box-shadow: 0 0 10px rgba(59, 130, 246, 0.1); }
.btn-accent { background: var(--accent); border: none; }
.btn-accent:hover { background: #2563eb; color: #fff; }
.btn-danger { color: var(--danger); }
.btn-danger:hover { color: #fff; background: var(--danger); border-color: var(--danger); }
.btn-warning { color: var(--warning); }
.btn-warning:hover { color: #000; background: var(--warning); border-color: var(--warning); }

/* Modal */
.modal { display: none; position: fixed; z-index: 2000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); }
.modal-content { background: var(--sidebar); margin: 10% auto; padding: 32px; border: 1px solid var(--border); width: 500px; border-radius: 24px; box-shadow: 0 30px 60px rgba(0,0,0,0.5); }
.form-group { margin-bottom: 20px; }
label { display: block; color: var(--text-dim); font-size: 0.85rem; margin-bottom: 8px; font-weight: 500; }
input, select { width: 100%; background: var(--bg); border: 1px solid var(--border); color: #fff; padding: 12px; border-radius: 10px; font-family: var(--font-main); transition: 0.3s; }
input:focus, select:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
.modal-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 32px; }

/* Config Cards */
.config-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 30px; }
.config-group { background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); padding: 25px; border-radius: 16px; }
.config-group h3 { font-size: 0.9rem; color: var(--accent); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 10px; }

#message-banner { margin-bottom: 20px; padding: 15px 24px; border-radius: 10px; font-weight: 600; display: none; animation: slideIn 0.3s ease; }
@keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
.success-banner { background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success); color: var(--success); }
.error-banner { background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); color: var(--danger); }
</style>
</head>
<body>
  <aside>
    <div class="logo">POLY<span>COPY</span></div>
    <div class="nav">
      <div class="nav-item active" onclick="showSection('dashboard', this)">
        <span>📊</span> Dashboard
      </div>
      <div class="nav-item" onclick="showSection('users', this)">
        <span>👥</span> Gerenciar Usuários
      </div>
      <div class="nav-item" onclick="showSection('config', this)">
        <span>⚙️</span> Configurações Globais
      </div>
      <div class="nav-item" onclick="showSection('logs', this)">
        <span>📜</span> Logs de Trading
      </div>
    </div>
    <div style="padding: 30px; border-top: 1px solid var(--border)">
      <button onclick="logout()" class="btn" style="width: 100%; color: var(--danger); border-color: var(--danger)">Sair do Painel</button>
    </div>
  </aside>

  <main>
    <header>
      <h2 id="section-title">Dashboard Overview</h2>
      <div class="user-info">
        <div style="text-align: right">
          <div id="admin-name" style="font-weight: 700; color: #fff">Admin User</div>
          <div id="admin-badge" class="badge badge-ready">PANEL_ADMIN</div>
        </div>
        <div class="avatar">A</div>
      </div>
    </header>

    <div id="message-banner"></div>

    <!-- Section: Dashboard -->
    <div id="section-dashboard" class="section active">
      <div class="grid">
        <div class="stat-card">
          <div class="stat-label">Total de Usuários</div>
          <div id="st-total-users" class="stat-value">0</div>
          <div class="stat-sub" style="color: var(--success)">SaaS Members</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Usuários Ativos</div>
          <div id="st-active-users" class="stat-value">0</div>
          <div class="stat-sub" style="color: var(--accent)">Bots Executando</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Modo do Sistema</div>
          <div id="st-sys-mode" class="stat-value" style="font-size: 1.5rem">PREVIEW</div>
          <div id="st-sys-sub" class="stat-sub" style="color: var(--warning)">Seguro (Simulação)</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Uptime do Servidor</div>
          <div id="st-uptime" class="stat-value" style="font-size: 1.5rem">00:00:00</div>
          <div class="stat-sub">Serviços Online</div>
        </div>
      </div>

      <h2>Atividade Recente (Global)</h2>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Follower</th>
              <th>Recurso</th>
              <th>Vetor</th>
              <th>Tamanho</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody id="dash-trade-body"></tbody>
        </table>
      </div>
    </div>

    <!-- Section: Users -->
    <div id="section-users" class="section">
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Identidade</th>
              <th>Carteira Operacional</th>
              <th>Estratégia / Trader</th>
              <th>Status Bot</th>
              <th>Ativo?</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="user-body"></tbody>
        </table>
      </div>
    </div>

    <!-- Section: Config -->
    <div id="section-config" class="section">
      <div class="config-grid">
        <div class="config-group">
          <h3>Estratégia de Cópia Global</h3>
          <div class="form-group">
            <label>Tipo de Cálculo</label>
            <select id="copyStrategy">
              <option value="PERCENTAGE">Porcentagem (Proporcional)</option>
              <option value="FIXED">Valor Fixo (USD)</option>
              <option value="ADAPTIVE">Adaptativa (IA)</option>
            </select>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px">
            <div class="form-group">
              <label>Tamanho Padrão (%)</label>
              <input type="number" id="copySize" step="0.1">
            </div>
            <div class="form-group">
              <label>Limite Max USD</label>
              <input type="number" id="maxOrderSize" step="1">
            </div>
          </div>
        </div>

        <div class="config-group">
          <h3>Infraestrutura (Variaveis Sensíveis)</h3>
          <div class="form-group">
            <label>RPC URL (Polygon)</label>
            <input type="url" id="rpcUrl">
          </div>
          <div class="form-group">
            <label>Check Interval (Segundos)</label>
            <input type="number" id="fetchInterval">
          </div>
          <div class="form-group" style="display:flex; align-items:center; gap:12px; margin-top:10px">
            <input type="checkbox" id="previewMode" style="width:20px; height:20px; accent-color:var(--accent)">
            <label style="margin-bottom:0">MODO_PREVIEW_GLOBAL (Simulação Segura)</label>
          </div>
        </div>
      </div>
      <div class="card" style="padding: 24px; margin-top: 30px; display: flex; gap: 15px">
        <button onclick="saveGlobalConfig()" class="btn btn-accent" style="padding: 12px 30px">Aplicar Mudanças Globais</button>
        <button onclick="resetToDefaults()" class="btn btn-warning">Resetar para Padrões</button>
      </div>
    </div>

    <!-- Section: Logs -->
    <div id="section-logs" class="section">
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>ID da Transação</th>
              <th>Vetor</th>
              <th>Volume</th>
              <th>Status de Rede</th>
            </tr>
          </thead>
          <tbody id="log-trade-body"></tbody>
        </table>
      </div>
    </div>
  </main>

  <!-- Modal Edit User -->
  <div id="modal-edit" class="modal">
    <div class="modal-content">
      <h2 style="margin-bottom:20px">Configurar Membro SaaS</h2>
      <input type="hidden" id="edit-chatId">
      <div class="form-group">
        <label>Endereço do Trader Monitorado</label>
        <input type="text" id="edit-trader" placeholder="0x...">
      </div>
      <div class="form-group">
        <label>Estratégia Proporcional</label>
        <select id="edit-strategy">
          <option value="PERCENTAGE">Percentage (%)</option>
          <option value="FIXED">Fixed (USD)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Tamanho da Cópia (Value)</label>
        <input type="number" id="edit-size" step="0.1">
      </div>
      <div class="modal-footer">
        <button onclick="closeModal()" class="btn">Cancelar</button>
        <button onclick="commitUserEdit()" class="btn btn-accent">Atualizar Cadastro</button>
      </div>
    </div>
  </div>

  <script>
    function showSection(id, el) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      document.getElementById('section-' + id).classList.add('active');
      el.classList.add('active');
      document.getElementById('section-title').textContent = id.charAt(0).toUpperCase() + id.slice(1);
      if (id === 'config') loadGlobalConfig();
    }

    async function refresh() {
      try {
        const [status, users, trades] = await Promise.all([
          fetch('/api/status').then(r => r.json()),
          fetch('/api/users').then(r => r.json()),
          fetch('/api/trades?limit=20').then(r => r.json())
        ]);

        // Stats
        document.getElementById('admin-name').textContent = status.username || 'Admin';
        document.getElementById('st-total-users').textContent = status.totalUsers;
        document.getElementById('st-active-users').textContent = status.activeUsers;
        document.getElementById('st-uptime').textContent = formatUptime(status.uptime);
        
        const modeEl = document.getElementById('st-sys-mode');
        const modeSubEl = document.getElementById('st-sys-sub');
        if (status.previewMode) {
          modeEl.textContent = 'PREVIEW';
          modeEl.style.color = 'var(--text)';
          modeSubEl.textContent = 'Simulação Segura Ativa';
          modeSubEl.style.color = 'var(--warning)';
        } else {
          modeEl.textContent = 'PRODUCTION';
          modeEl.style.color = 'var(--success)';
          modeSubEl.textContent = 'Operação Real em Chain';
          modeSubEl.style.color = 'var(--success)';
        }

        // Users Table
        document.getElementById('user-body').innerHTML = users.map(u => \`
          <tr>
            <td>
              <div style="font-weight: 700; color: #fff">\${u.username || u.chatId}</div>
              <div style="font-size: 0.7rem; color: var(--text-dim)">\${u.email || 'Web Session'}</div>
            </td>
            <td style="font-family: var(--font-mono); font-size: 0.75rem">\${u.wallet?.address || '---'}</td>
            <td>
              <div style="font-size: 0.75rem; color: var(--text-dim)">Follows: \${u.config?.traderAddress?.slice(0,10) || 'None'}</div>
              <div style="font-weight: 600">\${u.config?.strategy} (\${u.config?.copySize})</div>
            </td>
            <td><span class="badge \${u.step === 'ready' ? 'badge-ready' : 'badge-setup'}">\${u.step.toUpperCase()}</span></td>
            <td>
              <label class="switch">
                <input type="checkbox" \${u.config?.enabled ? 'checked' : ''} onchange="toggleUser('\${u.chatId}', this.checked)">
                <span class="slider"></span>
              </label>
            </td>
            <td>
              <div style="display: flex; gap: 8px">
                <button class="btn btn-accent" style="padding: 4px 8px" onclick="editUser('\${u.chatId}', '\${u.config?.traderAddress}', '\${u.config?.strategy}', \${u.config?.copySize})">🔧</button>
                <button class="btn btn-warning" style="padding: 4px 8px" onclick="resetUser('\${u.chatId}')">🔄</button>
                <button class="btn btn-danger" style="padding: 4px 8px" onclick="deleteUser('\${u.chatId}')">🗑️</button>
              </div>
            </td>
          </tr>
        \`).join('');

        // Trade Tables (Dash and Logs)
        const tradesHtml = trades.map(t => \`
          <tr>
            <td style="font-size: 0.75rem; color: var(--text-dim)">\${new Date(t.timestamp).toLocaleString()}</td>
            <td style="font-weight: 500">\${t.chatId || 'System'}</td>
            <td style="font-size: 0.8rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis">\${t.title || t.slug}</td>
            <td><span style="color: \${t.side === 'BUY' ? 'var(--success)' : 'var(--danger)'}">\${t.side}</span></td>
            <td style="font-weight: 700">$\${(t.usdcSize || 0).toFixed(2)}</td>
            <td><span style="color: \${t.bot ? 'var(--success)' : 'var(--warning)'}">\${t.bot ? 'EXECUTED' : 'PENDING'}</span></td>
          </tr>
        \`).join('');
        document.getElementById('dash-trade-body').innerHTML = tradesHtml;
        document.getElementById('log-trade-body').innerHTML = tradesHtml; // Detailed view could be richer

      } catch (e) { console.error('Refresh failed:', e); }
    }

    async function toggleUser(chatId, enabled) {
      await fetch(\`/api/users/\${chatId}/config\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { enabled } })
      });
      showBanner(enabled ? 'Membro SaaS Ativado' : 'Bot Suspenso', 'success');
      refresh();
    }

    function editUser(chatId, trader, strategy, size) {
      document.getElementById('edit-chatId').value = chatId;
      document.getElementById('edit-trader').value = trader || '';
      document.getElementById('edit-strategy').value = strategy || 'PERCENTAGE';
      document.getElementById('edit-size').value = size || 0;
      document.getElementById('modal-edit').style.display = 'block';
    }

    async function commitUserEdit() {
      const chatId = document.getElementById('edit-chatId').value;
      const config = {
        traderAddress: document.getElementById('edit-trader').value,
        strategy: document.getElementById('edit-strategy').value,
        copySize: parseFloat(document.getElementById('edit-size').value)
      };
      
      const res = await fetch(\`/api/users/\${chatId}/config\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      if (res.ok) {
        showBanner('Configuração do Usuário Atualizada', 'success');
        closeModal();
        refresh();
      }
    }

    async function resetUser(chatId) {
      if (!confirm('CONFIRMAR RESET? Isso limpará a carteira e o fluxo do usuário.')) return;
      await fetch(\`/api/users/\${chatId}/reset\`, { method: 'POST' });
      showBanner('Usuário resetado com sucesso', 'warning');
      refresh();
    }

    async function deleteUser(chatId) {
      if (!confirm('CONFIRMAR EXCLUSÃO PERMANENTE?')) return;
      await fetch(\`/api/users/\${chatId}\`, { method: 'DELETE' });
      showBanner('Membro excluído do SaaS', 'danger');
      refresh();
    }

    async function loadGlobalConfig() {
      const res = await fetch('/api/config/advanced');
      const c = await res.json();
      document.getElementById('copyStrategy').value = c.copyStrategy;
      document.getElementById('copySize').value = c.copySize;
      document.getElementById('maxOrderSize').value = c.maxOrderSize;
      document.getElementById('rpcUrl').value = c.rpcUrl;
      document.getElementById('fetchInterval').value = c.fetchInterval;
      document.getElementById('previewMode').checked = c.previewMode === 'true';
    }

    async function saveGlobalConfig() {
      const config = {
        copyStrategy: document.getElementById('copyStrategy').value,
        copySize: document.getElementById('copySize').value,
        maxOrderSize: document.getElementById('maxOrderSize').value,
        rpcUrl: document.getElementById('rpcUrl').value,
        fetchInterval: document.getElementById('fetchInterval').value,
        previewMode: document.getElementById('previewMode').checked.toString()
      };
      const res = await fetch('/api/config/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) showBanner('Configurações Globais Aplicadas', 'success');
    }

    function formatUptime(s) {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return [h, m, sec].map(v => v < 10 ? '0' + v : v).join(':');
    }

    function showBanner(msg, type) {
      const b = document.getElementById('message-banner');
      b.textContent = msg.toUpperCase();
      b.className = type + '-banner';
      b.style.display = 'block';
      setTimeout(() => b.style.display = 'none', 4000);
    }

    function closeModal() { document.getElementById('modal-edit').style.display = 'none'; }
    async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }

    refresh();
    setInterval(refresh, 5000);
  </script>
</body> </html>`;
app.get('/login', (req, res) => {
    if (req.cookies.auth_token)
        return res.redirect('/');
    res.type('html').send(loginHtml);
});
app.get('/signup', (req, res) => {
    if (req.cookies.auth_token)
        return res.redirect('/');
    res.type('html').send(signupHtml);
});
app.get('/', authenticateToken, (req, res) => {
    res.type('html').send(dashboardHtml);
});
export const startServer = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (port = parseInt(process.env.PORT || '3000')) {
    yield bootstrapAdmin();
    botStartTime = Date.now();
    app.listen(port, '0.0.0.0', () => {
        console.log(`\n🌐 Web UI:  http://0.0.0.0:${port}`);
        console.log(`📖 Swagger: http://0.0.0.0:${port}/docs`);
        console.log(`🔌 API:     http://0.0.0.0:${port}/api/health\n`);
    });
});
export default app;
