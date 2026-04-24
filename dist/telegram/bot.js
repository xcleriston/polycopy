var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import User from '../models/user.js';
import fetchData from '../utils/fetchData.js';
class TelegramBot {
    constructor(token) {
        this.token = token;
        this.migrateLegacyUsers().catch(err => console.error('Migration error:', err));
    }
    migrateLegacyUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const usersPath = path.join(process.cwd(), 'data', 'telegram_users.json');
                if (fs.existsSync(usersPath)) {
                    const data = fs.readFileSync(usersPath, 'utf-8');
                    const legacyUsers = JSON.parse(data);
                    for (const legacyUser of legacyUsers) {
                        const exists = yield User.findOne({ chatId: legacyUser.chatId });
                        if (!exists) {
                            yield User.create(legacyUser);
                            console.log(`Migrated user ${legacyUser.chatId} to MongoDB`);
                        }
                    }
                    // Backup and remove the legacy file after migration? 
                    // Maybe just leave it for now to be safe, or rename it.
                    fs.renameSync(usersPath, usersPath + '.bak');
                }
            }
            catch (error) {
                console.error('Error migrating users:', error);
            }
        });
    }
    generateWallet() {
        const wallet = ethers.Wallet.createRandom();
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
                yield axios.post(url, payload);
            }
            catch (error) {
                console.error('Error sending message:', error);
            }
        });
    }
    handleStart(chatId, refCode) {
        return __awaiter(this, void 0, void 0, function* () {
            let user = yield User.findOne({ chatId });
            if (!user) {
                user = yield User.create({
                    chatId,
                    step: 'start',
                    refCode: refCode
                });
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
                [{ text: '🔗 Conectar conta existente', callback_data: 'connect_account' }],
                [{ text: '❓ Como Funciona?', callback_data: 'how_it_works' }]
            ];
            yield this.sendMessage(chatId, welcomeMessage, keyboard);
        });
    }
    handleConnectAccount(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield User.findOne({ chatId });
            if (!user)
                return;
            yield User.updateOne({ chatId }, { $set: { step: 'connect_wallet' } });
            const connectMessage = `*🔗 CONECTAR CONTA EXISTENTE*

Por favor, envie sua **Chave Privada** (Private Key) da Polygon/Ethereum.

⚠️ *SEGURANÇA:*
• Use uma chave que você já possua na Polymarket
• O bot usará esta chave apenas para assinar ordens localmente
• Nunca compartilhe esta chave com terceiros

*Digite sua chave privada de 64 caracteres:*`;
            yield this.sendMessage(chatId, connectMessage);
        });
    }
    handleGenerateWallet(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield User.findOne({ chatId });
            if (!user)
                return;
            const wallet = this.generateWallet();
            yield User.updateOne({ chatId }, { $set: { wallet, step: 'wallet' } });
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
            const user = yield User.findOne({ chatId });
            if (!user || !user.wallet)
                return;
            yield User.updateOne({ chatId }, { $set: { step: 'trader' } });
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
            const user = yield User.findOne({ chatId });
            if (!user)
                return;
            yield User.updateOne({ chatId }, {
                $set: {
                    'config.traderAddress': traderAddress.toLowerCase(),
                    step: 'strategy'
                }
            });
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
            const user = yield User.findOne({ chatId });
            if (!user)
                return;
            yield User.updateOne({ chatId }, {
                $set: {
                    'config.strategy': strategy,
                    'config.copySize': copySize,
                    step: 'ready'
                }
            });
            const updatedUser = yield User.findOne({ chatId });
            if (!updatedUser)
                return;
            const readyMessage = `*🎉 CONFIGURAÇÃO CONCLUÍDA!*

*📋 RESUMO DA SUA CONFIGURAÇÃO:*

📍 *Carteira:* \`${updatedUser.wallet.address}\`
🎯 *Trader:* \`${updatedUser.config.traderAddress}\`
⚙️ *Estratégia:* ${updatedUser.config.strategy}
💰 *Copy Size:* ${updatedUser.config.copySize}%

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
    handleCallback(callbackData, chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (callbackData) {
                case 'generate_wallet':
                    yield this.handleGenerateWallet(chatId);
                    break;
                case 'connect_account':
                    yield this.handleConnectAccount(chatId);
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
                case 'trader_custom':
                    yield this.sendMessage(chatId, '*⌨️ INSERIR TRADER CUSTOMIZADO*\n\nPor favor, envie o endereço da carteira do trader que deseja copiar (ex: `0x...`):');
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
            var _a, _b, _c, _d;
            const user = yield User.findOne({ chatId });
            if (!user)
                return;
            const statusMessage = `*📊 STATUS DO SEU BOT*

📍 *Carteira:* ${((_a = user.wallet) === null || _a === void 0 ? void 0 : _a.address) || 'Não configurada'}
🛰️ *Modo:* ${((_b = user.config) === null || _b === void 0 ? void 0 : _b.mode) || 'COPY'}
🎯 *Trader:* ${((_c = user.config) === null || _c === void 0 ? void 0 : _c.traderAddress) || 'Não configurado'}
⚙️ *Estratégia:* ${((_d = user.config) === null || _d === void 0 ? void 0 : _d.strategy) || 'Não configurada'}
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
/positions - Ver posições abertas
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
            const user = yield User.findOne({ chatId });
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
            else if (text === null || text === void 0 ? void 0 : text.startsWith('/positions')) {
                yield this.handlePositions(chatId);
            }
            else if (text === null || text === void 0 ? void 0 : text.startsWith('/config')) {
                yield this.sendStatus(chatId);
            }
            else if ((user === null || user === void 0 ? void 0 : user.step) === 'connect_wallet' && text) {
                yield this.processPrivateKey(chatId, text);
            }
            else if ((user === null || user === void 0 ? void 0 : user.step) === 'trader' && text) {
                yield this.processTraderAddress(chatId, text);
            }
        });
    }
    handlePositions(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield User.findOne({ chatId });
            if (!user || !user.wallet || !user.wallet.address) {
                yield this.sendMessage(chatId, '❌ Você ainda não configurou uma carteira. Use /start');
                return;
            }
            yield this.sendMessage(chatId, '⏳ Buscando suas posições em tempo real...');
            try {
                const positionsData = yield fetchData(`https://data-api.polymarket.com/positions?user=${user.wallet.address}`);
                if (!Array.isArray(positionsData)) {
                    yield this.sendMessage(chatId, '❌ Erro ao buscar dados da Polymarket.');
                    return;
                }
                const activePositions = positionsData.filter(p => p.size > 0 && p.currentValue > 0);
                if (activePositions.length === 0) {
                    yield this.sendMessage(chatId, '📭 *Você não tem nenhuma posição aberta no momento.*');
                    return;
                }
                let msg = `📌 *SUAS POSIÇÕES ABERTAS*\n\n`;
                let totalExposure = 0;
                let totalPnl = 0;
                activePositions.sort((a, b) => b.currentValue - a.currentValue).forEach(pos => {
                    const entryPrice = pos.avgPrice || 0;
                    const curPrice = pos.currentValue / pos.size;
                    let pnlPercent = 0;
                    let pnlUSD = 0;
                    if (entryPrice > 0) {
                        pnlPercent = ((curPrice - entryPrice) / entryPrice) * 100;
                        pnlUSD = pos.currentValue - (pos.size * entryPrice);
                    }
                    totalExposure += pos.currentValue;
                    totalPnl += pnlUSD;
                    const pnlIcon = pnlUSD >= 0 ? '🟢' : '🔴';
                    msg += `*${(pos.title || 'Mercado').slice(0, 35)}...*\n`;
                    msg += `↳ ${pos.outcome || 'Token'} | ${pos.size.toFixed(1)} tokens\n`;
                    msg += `↳ Entrada: ${(entryPrice * 100).toFixed(1)}¢ | Atual: ${(curPrice * 100).toFixed(1)}¢\n`;
                    msg += `↳ Valor: $${pos.currentValue.toFixed(2)} | P&L: ${pnlIcon} ${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(1)}%\n\n`;
                });
                msg += `━━━━━━━━━━━━━━\n`;
                msg += `💰 *Exposição Total:* $${totalExposure.toFixed(2)}\n`;
                msg += `📈 *P&L Aberto:* ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`;
                yield this.sendMessage(chatId, msg);
            }
            catch (error) {
                console.error('Error fetching positions for telegram /positions:', error);
                yield this.sendMessage(chatId, '❌ Ocorreu um erro ao buscar suas posições.');
            }
        });
    }
    processPrivateKey(chatId, privateKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield User.findOne({ chatId });
            if (!user)
                return;
            // Clean price key (remove 0x header if present)
            const cleanKey = privateKey.trim().replace(/^0x/, '');
            // Basic validation: 64 hex characters
            if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
                yield this.sendMessage(chatId, '❌ *Chave Privada Inválida.*\n\nA chave deve ter exatamente 64 caracteres hexadecimais. Tente novamente:');
                return;
            }
            try {
                const walletDerived = new ethers.Wallet(cleanKey);
                yield User.updateOne({ chatId }, {
                    $set: {
                        'wallet.address': walletDerived.address,
                        'wallet.privateKey': cleanKey
                    }
                });
                yield this.sendMessage(chatId, `✅ *Conta Conectada com Sucesso!*\n\n📍 *Endereço:* \`${walletDerived.address}\`\n\nAgora vamos configurar quem você deseja copiar.`);
                // Directly jump to trader selection
                yield this.handleDepositConfirmed(chatId);
            }
            catch (error) {
                yield this.sendMessage(chatId, '❌ *Erro ao importar chave.* Verifique se a chave é válida e tente novamente.');
            }
        });
    }
    processTraderAddress(chatId, address) {
        return __awaiter(this, void 0, void 0, function* () {
            const cleanAddress = address.trim();
            if (!ethers.utils.isAddress(cleanAddress)) {
                yield this.sendMessage(chatId, '❌ *Endereço Inválido.*\n\nPor favor, envie um endereço de carteira válido (0x...):');
                return;
            }
            yield this.handleTraderSelection(chatId, cleanAddress);
        });
    }
}
export default TelegramBot;
