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
const ethers_1 = require("ethers");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
class TelegramBot {
    constructor(token) {
        this.users = new Map();
        this.privateKeys = new Map(); // temp storage for security
        this.token = token;
        this.loadUsers();
    }
    loadUsers() {
        try {
            const usersPath = path.join(process.cwd(), 'data', 'telegram_users.json');
            if (fs.existsSync(usersPath)) {
                const data = fs.readFileSync(usersPath, 'utf-8');
                const users = JSON.parse(data);
                users.forEach((user) => {
                    this.users.set(user.chatId, user);
                });
            }
        }
        catch (error) {
            console.error('Error loading users:', error);
        }
    }
    saveUsers() {
        try {
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            const usersPath = path.join(dataDir, 'telegram_users.json');
            fs.writeFileSync(usersPath, JSON.stringify(Array.from(this.users.values())));
        }
        catch (error) {
            console.error('Error saving users:', error);
        }
    }
    generateWallet() {
        const wallet = ethers_1.ethers.Wallet.createRandom();
        return {
            address: wallet.address,
            privateKey: wallet.privateKey
        };
    }
    generateRefCode() {
        return 'ref_' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }
    getDepositLinks(address) {
        return {
            usdc: `https://wallet.polygon.technology/polygon/bridge/deposit?to=${address}`,
            pol: `https://www.coingecko.com/en/coins/polygon?utm_source=polycopy`,
            quickswap: `https://quickswap.exchange/#/swap?inputCurrency=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174&outputCurrency=0x458Efe634a885F2A2A57B106063e822A060f9dcF&recipient=${address}`
        };
    }
    sendMessage(chatId, text, keyboard) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
            const payload = {
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            };
            if (keyboard) {
                payload.reply_markup = {
                    inline_keyboard: keyboard
                };
            }
            try {
                yield axios_1.default.post(url, payload);
            }
            catch (error) {
                console.error('Error sending message:', error);
            }
        });
    }
    handleStart(chatId, refCode) {
        return __awaiter(this, void 0, void 0, function* () {
            let user = this.users.get(chatId);
            if (!user) {
                user = {
                    chatId,
                    step: 'start',
                    refCode: refCode
                };
                this.users.set(chatId, user);
            }
            const welcomeMessage = `*🚀 BEM-VINDO AO POLYCOPY BOT!*

Este bot irá criar sua carteira e configurar seu sistema de copy trading automático.

*📋 PASSO 1: CRIAR CARTEIRA*

Vou gerar uma carteira Polygon para você começar a operar na Polymarket.

⚠️ *MUITO IMPORTANTE:* 
• Guarde sua chave privada em local seguro
• Nunca compartilhe com ninguém
• A chave dá acesso total aos seus fundos

Clique em "Gerar Carteira" para continuar:`;
            const keyboard = [
                [{ text: '🔐 Gerar Nova Carteira', callback_data: 'generate_wallet' }],
                [{ text: '❓ Como Funciona?', callback_data: 'how_it_works' }]
            ];
            yield this.sendMessage(chatId, welcomeMessage, keyboard);
        });
    }
    handleGenerateWallet(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = this.users.get(chatId);
            if (!user)
                return;
            const wallet = this.generateWallet();
            user.wallet = wallet;
            user.step = 'wallet';
            this.users.set(chatId, user);
            this.saveUsers();
            const depositLinks = this.getDepositLinks(wallet.address);
            const walletMessage = `*✅ CARTEIRA CRIADA COM SUCESSO!*

*📍 ENDEREÇO DA CARTEIRA:*
\`${wallet.address}\`

*🔑 CHAVE PRIVADA:*
\`${wallet.privateKey}\`

⚠️ *SALVE ESTA CHAVE PRIVADA EM LOCAL SEGURO!*
• Anote em papel
• Salve em gerenciador de senhas
• Nunca compartilhe

*💰 PASSO 2: DEPOSITAR FUNDOS*

Para operar, você precisa de:
• **USDC** para fazer trades
• **POL** para taxas de gás

*🔗 LINKS DE DEPÓSITO:*

1. **Bridge USDC → Polygon:**
${depositLinks.usdc}

2. **Comprar POL (gás):**
${depositLinks.pol}

3. **QuickSwap (alternativa):**
${depositLinks.quickswap}

*💡 VALOR SUGERIDO:* Comece com $100-500 USDC

Após depositar, clique em "Confirmar Depósito":`;
            const keyboard = [
                [{ text: '✅ Já Depositei Fundos', callback_data: 'deposit_confirmed' }],
                [{ text: '❓ Ajuda com Depósito', callback_data: 'deposit_help' }]
            ];
            yield this.sendMessage(chatId, walletMessage, keyboard);
        });
    }
    handleDepositConfirmed(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = this.users.get(chatId);
            if (!user || !user.wallet)
                return;
            user.step = 'trader';
            this.users.set(chatId, user);
            const traderMessage = `*📊 PASSO 3: ESCOLHER TRADER*

Agora escolha qual trader você deseja copiar:

*🎯 OPÇÕES POPULARES:*

1. *Trader Exemplo 1* (Alto volume)
   \`0x2005d16a84ceefa912d4e380cd32e7ff827875ea\`

2. *Trader Exemplo 2* (Conservador)
   \`0xd62531bc536bff72394fc5ef715525575787e809\`

3. *Custom* (Seu próprio trader)

Digite o endereço do trader que deseja copiar ou escolha uma opção acima:`;
            const keyboard = [
                [{ text: '🎯 Usar Trader Popular 1', callback_data: 'trader_popular_1' }],
                [{ text: '🛡️ Usar Trader Popular 2', callback_data: 'trader_popular_2' }],
                [{ text: '📝 Inserir Endereço Customizado', callback_data: 'trader_custom' }]
            ];
            yield this.sendMessage(chatId, traderMessage, keyboard);
        });
    }
    handleTraderSelection(chatId, traderAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = this.users.get(chatId);
            if (!user)
                return;
            user.config = Object.assign(Object.assign({}, user.config), { traderAddress });
            user.step = 'strategy';
            this.users.set(chatId, user);
            const strategyMessage = `*⚙️ PASSO 4: CONFIGURAR ESTRATÉGIA*

Escolha sua estratégia de copy trading:

*📈 ESTRATÉGIAS DISPONÍVEIS:*

1. *Porcentagem* (Recomendado)
   Copia X% de cada trade
   Ex: 10% = se trader investir $100, você investe $10

2. *Valor Fixo*
   Valor fixo por trade
   Ex: $50 por trade independente do tamanho

3. *Adaptiva*
   Ajusta % baseado no tamanho do trade
   Menor % para trades grandes, maior % para pequenos

Escolha sua estratégia:`;
            const keyboard = [
                [{ text: '📊 Porcentagem (10%)', callback_data: 'strategy_percentage' }],
                [{ text: '💰 Valor Fixo ($50)', callback_data: 'strategy_fixed' }],
                [{ text: '🔄 Adaptiva', callback_data: 'strategy_adaptive' }]
            ];
            yield this.sendMessage(chatId, strategyMessage, keyboard);
        });
    }
    handleStrategySelection(chatId, strategy, copySize) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = this.users.get(chatId);
            if (!user)
                return;
            user.config = Object.assign(Object.assign({}, user.config), { strategy, copySize });
            user.step = 'ready';
            this.users.set(chatId, user);
            this.saveUsers();
            // Update .env file with user configuration
            yield this.updateEnvFile(user);
            const readyMessage = `*🎉 CONFIGURAÇÃO CONCLUÍDA!*

*📋 RESUMO DA SUA CONFIGURAÇÃO:*

📍 *Carteira:* \`${user.wallet.address}\`
🎯 *Trader:* \`${user.config.traderAddress}\`
⚙️ *Estratégia:* ${user.config.strategy}
💰 *Copy Size:* ${user.config.copySize}%

*🚀 PRÓXIMOS PASSOS:*

1. ✅ Bot está configurado
2. ✅ Monitorando trades do trader
3. ⏳ Aguardando novas operações

*📱 COMANDOS DISPONÍVEIS:*
/status - Ver status atual
/wallet - Ver informações da carteira
/config - Ver configurações
/help - Ajuda

*🌐 ACESSAR DASHBOARD:*
http://localhost:3000

*⚠️ MODO SEGURO ATIVO:*
Por enquanto, o bot está operando em modo preview (sem trades reais). 
Para ativar trades reais, desative o PREVIEW_MODE nas configurações.

Parabéns! Seu bot está pronto para operar! 🚀`;
            const keyboard = [
                [{ text: '📊 Ver Status', callback_data: 'check_status' }],
                [{ text: '🌐 Abrir Dashboard', url: 'http://localhost:3000' }],
                [{ text: '❓ Ajuda', callback_data: 'help' }]
            ];
            yield this.sendMessage(chatId, readyMessage, keyboard);
        });
    }
    updateEnvFile(user) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            try {
                const envPath = path.join(process.cwd(), '.env');
                let envContent = '';
                if (fs.existsSync(envPath)) {
                    envContent = fs.readFileSync(envPath, 'utf-8');
                }
                const updates = [
                    { key: 'USER_ADDRESSES', value: ((_a = user.config) === null || _a === void 0 ? void 0 : _a.traderAddress) || '' },
                    { key: 'PROXY_WALLET', value: ((_b = user.wallet) === null || _b === void 0 ? void 0 : _b.address) || '' },
                    { key: 'PRIVATE_KEY', value: ((_c = user.wallet) === null || _c === void 0 ? void 0 : _c.privateKey) || '' },
                    { key: 'COPY_STRATEGY', value: ((_d = user.config) === null || _d === void 0 ? void 0 : _d.strategy) || 'PERCENTAGE' },
                    { key: 'COPY_SIZE', value: ((_f = (_e = user.config) === null || _e === void 0 ? void 0 : _e.copySize) === null || _f === void 0 ? void 0 : _f.toString()) || '10.0' },
                    { key: 'PREVIEW_MODE', value: 'true' }
                ];
                updates.forEach(({ key, value }) => {
                    const regex = new RegExp(`^${key}\\s*=.*$`, 'm');
                    if (regex.test(envContent)) {
                        envContent = envContent.replace(regex, `${key}='${value}'`);
                    }
                    else {
                        envContent += `\n${key}='${value}'`;
                    }
                });
                fs.writeFileSync(envPath, envContent);
            }
            catch (error) {
                console.error('Error updating .env file:', error);
            }
        });
    }
    handleCallback(callbackData, chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = this.users.get(chatId);
            switch (callbackData) {
                case 'generate_wallet':
                    yield this.handleGenerateWallet(chatId);
                    break;
                case 'deposit_confirmed':
                    yield this.handleDepositConfirmed(chatId);
                    break;
                case 'trader_popular_1':
                    yield this.handleTraderSelection(chatId, '0x2005d16a84ceefa912d4e380cd32e7ff827875ea');
                    break;
                case 'trader_popular_2':
                    yield this.handleTraderSelection(chatId, '0xd62531bc536bff72394fc5ef715525575787e809');
                    break;
                case 'strategy_percentage':
                    yield this.handleStrategySelection(chatId, 'PERCENTAGE', 10.0);
                    break;
                case 'strategy_fixed':
                    yield this.handleStrategySelection(chatId, 'FIXED', 50.0);
                    break;
                case 'strategy_adaptive':
                    yield this.handleStrategySelection(chatId, 'ADAPTIVE', 10.0);
                    break;
                case 'check_status':
                    yield this.sendStatus(chatId);
                    break;
                case 'help':
                    yield this.sendHelp(chatId);
                    break;
                default:
                    yield this.sendMessage(chatId, 'Opção não reconhecida. Tente novamente.');
            }
        });
    }
    sendStatus(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const user = this.users.get(chatId);
            if (!user)
                return;
            const statusMessage = `*📊 STATUS DO SEU BOT*

📍 *Carteira:* ${((_a = user.wallet) === null || _a === void 0 ? void 0 : _a.address) || 'Não configurada'}
🎯 *Trader:* ${((_b = user.config) === null || _b === void 0 ? void 0 : _b.traderAddress) || 'Não configurado'}
⚙️ *Estratégia:* ${((_c = user.config) === null || _c === void 0 ? void 0 : _c.strategy) || 'Não configurada'}
📝 *Step:* ${user.step || 'Não iniciado'}

*🌐 Dashboard:* http://localhost:3000
*📖 API Docs:* http://localhost:3000/docs`;
            yield this.sendMessage(chatId, statusMessage);
        });
    }
    sendHelp(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const helpMessage = `*❓ AJUDA - POLYCOPY BOT*

*🚀 COMANDOS:*
/start - Iniciar configuração
/status - Ver status atual
/wallet - Informações da carteira
/config - Ver configurações
/help - Esta mensagem de ajuda

*🔗 LINKS ÚTEIS:*
Dashboard: http://localhost:3000
API Docs: http://localhost:3000/docs

*📞 SUPORTE:*
Se precisar de ajuda, contate nosso suporte.

*⚠️ IMPORTANTE:*
• Nunca compartilhe sua chave privada
• Mantenha seu bot atualizado
• Monitore suas operações regularmente`;
            yield this.sendMessage(chatId, helpMessage);
        });
    }
    handleMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            const chatId = message.chat.id.toString();
            const text = message.text;
            if (text === null || text === void 0 ? void 0 : text.startsWith('/start')) {
                const refCode = text.split(' ')[1];
                yield this.handleStart(chatId, refCode);
            }
            else if (text === null || text === void 0 ? void 0 : text.startsWith('/status')) {
                yield this.sendStatus(chatId);
            }
            else if (text === null || text === void 0 ? void 0 : text.startsWith('/help')) {
                yield this.sendHelp(chatId);
            }
            else if (text === null || text === void 0 ? void 0 : text.startsWith('/wallet')) {
                yield this.sendStatus(chatId);
            }
            else if (text === null || text === void 0 ? void 0 : text.startsWith('/config')) {
                yield this.sendStatus(chatId);
            }
        });
    }
}
exports.default = TelegramBot;
