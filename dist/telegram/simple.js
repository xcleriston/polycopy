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
class TelegramBotSimple {
    constructor(token) {
        this.users = new Map();
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
            fs.writeFileSync(usersPath, JSON.stringify(Array.from(this.users.values()), null, 2));
        }
        catch (error) {
            console.error('Error saving users:', error);
        }
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
                text: text
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
            var _a, _b, _c;
            let user = this.users.get(chatId);
            if (!user) {
                user = {
                    chatId,
                    step: 'start',
                    refCode: refCode
                };
                this.users.set(chatId, user);
            }
            // Check if user already has a wallet
            if (user.wallet && user.step === 'ready') {
                const statusMessage = `BEM-VINDO DE VOLTA AO POLYCOPY!

Voce ja tem uma configuracao completa:

📍 CARTEIRA: ${user.wallet.address}
🎯 TRADER: ${((_a = user.config) === null || _a === void 0 ? void 0 : _a.traderAddress) || 'Nao configurado'}
⚙️ ESTRATEGIA: ${((_b = user.config) === null || _b === void 0 ? void 0 : _b.strategy) || 'Nao configurada'}
💰 COPY SIZE: ${((_c = user.config) === null || _c === void 0 ? void 0 : _c.copySize) || 'Nao configurado'}%

O que voce gostaria de fazer?`;
                const keyboard = [
                    [{ text: 'Ver Status Completo', callback_data: 'check_status' }],
                    [{ text: 'Abrir Dashboard', callback_data: 'open_dashboard' }],
                    [{ text: 'Reconfigurar Bot', callback_data: 'reconfigure' }],
                    [{ text: 'Ajuda', callback_data: 'help' }]
                ];
                yield this.sendMessage(chatId, statusMessage, keyboard);
                return;
            }
            const welcomeMessage = `BEM-VINDO AO POLYCOPY BOT!

Este bot irá criar sua carteira e configurar seu sistema de copy trading automático.

PASSO 1: CRIAR CARTEIRA

Vou gerar uma carteira Polygon para você começar a operar na Polymarket.

MUITO IMPORTANTE: 
- Guarde sua chave privada em local seguro
- Nunca compartilhe com ninguém
- A chave dá acesso total aos seus fundos

Clique em "Gerar Carteira" para continuar:`;
            const keyboard = [
                [{ text: 'Gerar Nova Carteira', callback_data: 'generate_wallet' }],
                [{ text: 'Como Funciona?', callback_data: 'how_it_works' }]
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
            const walletMessage = `CARTEIRA CRIADA COM SUCESSO!

ENDERECO DA CARTEIRA:
${wallet.address}

CHAVE PRIVADA:
${wallet.privateKey}

SALVE ESTA CHAVE PRIVADA EM LOCAL SEGURO!
- Anote em papel
- Salve em gerenciador de senhas
- Nunca compartilhe

PASSO 2: DEPOSITAR FUNDOS

Para operar, você precisa de:
- USDC para fazer trades
- POL para taxas de gás

LINKS DE DEPÓSITO:

1. Bridge USDC para Polygon:
${depositLinks.usdc}

2. Comprar POL (gás):
${depositLinks.pol}

3. QuickSwap (alternativa):
${depositLinks.quickswap}

VALOR SUGERIDO: Comece com $100-500 USDC

Após depositar, clique em "Confirmar Depósito":`;
            const keyboard = [
                [{ text: 'Ja Depositei Fundos', callback_data: 'deposit_confirmed' }],
                [{ text: 'Ajuda com Deposito', callback_data: 'deposit_help' }]
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
            const traderMessage = `PASSO 3: ESCOLHER TRADER

Agora escolha qual trader você deseja copiar:

OPCOES POPULARES:

1. Trader Exemplo 1 (Alto volume)
   0x2005d16a84ceefa912d4e380cd32e7ff827875ea

2. Trader Exemplo 2 (Conservador)
   0xd62531bc536bff72394fc5ef715525575787e809

3. Custom (Seu proprio trader)

Digite o endereco do trader que deseja copiar ou escolha uma opcao acima:`;
            const keyboard = [
                [{ text: 'Usar Trader Popular 1', callback_data: 'trader_popular_1' }],
                [{ text: 'Usar Trader Popular 2', callback_data: 'trader_popular_2' }],
                [{ text: 'Inserir Endereco Customizado', callback_data: 'trader_custom' }]
            ];
            yield this.sendMessage(chatId, traderMessage, keyboard);
        });
    }
    handleTraderSelection(chatId, traderAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = this.users.get(chatId);
            if (!user)
                return;
            // Handle reconfiguration
            if (traderAddress === '') {
                const traderMessage = `RECONFIGURAR TRADER

Escolha qual trader voce deseja copiar:

OPCOES POPULARES:

1. Trader Exemplo 1 (Alto volume)
   0x2005d16a84ceefa912d4e380cd32e7ff827875ea

2. Trader Exemplo 2 (Conservador)
   0xd62531bc536bff72394fc5ef715525575787e809

3. Custom (Seu proprio trader)

Digite o endereco do trader que deseja copiar ou escolha uma opcao acima:`;
                const keyboard = [
                    [{ text: 'Usar Trader Popular 1', callback_data: 'trader_popular_1' }],
                    [{ text: 'Usar Trader Popular 2', callback_data: 'trader_popular_2' }],
                    [{ text: 'Inserir Endereco Customizado', callback_data: 'trader_custom' }]
                ];
                yield this.sendMessage(chatId, traderMessage, keyboard);
                return;
            }
            user.config = Object.assign(Object.assign({}, user.config), { traderAddress });
            user.step = 'strategy';
            this.users.set(chatId, user);
            const strategyMessage = `PASSO 4: CONFIGURAR ESTRATEGIA

Escolha sua estrategia de copy trading:

ESTRATEGIAS DISPONIVEIS:

1. Porcentagem (Recomendado)
   Copia X% de cada trade
   Ex: 10% = se trader investir $100, voce investe $10

2. Valor Fixo
   Valor fixo por trade
   Ex: $50 por trade independente do tamanho

3. Adaptiva
   Ajusta % baseado no tamanho do trade
   Menor % para trades grandes, maior % para pequenos

Escolha sua estrategia:`;
            const keyboard = [
                [{ text: 'Porcentagem (10%)', callback_data: 'strategy_percentage' }],
                [{ text: 'Porcentagem Customizada', callback_data: 'strategy_percentage_custom' }],
                [{ text: 'Valor Fixo ($50)', callback_data: 'strategy_fixed' }],
                [{ text: 'Adaptiva', callback_data: 'strategy_adaptive' }]
            ];
            yield this.sendMessage(chatId, strategyMessage, keyboard);
        });
    }
    handleStrategySelection(chatId, strategy, copySize) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = this.users.get(chatId);
            if (!user)
                return;
            // Handle reconfiguration
            if (strategy === 'RECONFIGURE') {
                const strategyMessage = `RECONFIGURAR ESTRATEGIA

Escolha sua nova estrategia de copy trading:

ESTRATEGIAS DISPONIVEIS:

1. Porcentagem (Recomendado)
   Copia X% de cada trade
   Ex: 10% = se trader investir $100, voce investe $10

2. Valor Fixo
   Valor fixo por trade
   Ex: $50 por trade independente do tamanho

3. Adaptiva
   Ajusta % baseado no tamanho do trade
   Menor % para trades grandes, maior % para pequenos

Escolha sua estrategia:`;
                const keyboard = [
                    [{ text: 'Porcentagem (10%)', callback_data: 'strategy_percentage' }],
                    [{ text: 'Porcentagem Customizada', callback_data: 'strategy_percentage_custom' }],
                    [{ text: 'Valor Fixo ($50)', callback_data: 'strategy_fixed' }],
                    [{ text: 'Adaptiva', callback_data: 'strategy_adaptive' }]
                ];
                yield this.sendMessage(chatId, strategyMessage, keyboard);
                return;
            }
            user.config = Object.assign(Object.assign({}, user.config), { strategy, copySize });
            user.step = 'ready';
            this.users.set(chatId, user);
            this.saveUsers();
            // Update .env file with user configuration
            yield this.updateEnvFile(user);
            const readyMessage = `CONFIGURACAO CONCLUIDA!

RESUMO DA SUA CONFIGURACAO:

Carteira: ${user.wallet.address}
Trader: ${user.config.traderAddress}
Estrategia: ${user.config.strategy}
Copy Size: ${user.config.copySize}%

PROXIMOS PASSOS:

1. Bot esta configurado
2. Monitorando trades do trader
3. Aguardando novas operacoes

COMANDOS DISPONIVEIS:
/status - Ver status atual
/wallet - Ver informacoes da carteira
/config - Ver configuracoes
/help - Ajuda

ACESSAR DASHBOARD:
http://localhost:3000

MODO SEGURO ATIVO:
Por enquanto, o bot esta operando em modo preview (sem trades reais). 
Para ativar trades reais, desative o PREVIEW_MODE nas configuracoes.

Parabens! Seu bot esta pronto para operar!

LINK DE REFERENCIA:
Compartilhe este link com amigos:
https://t.me/Copies_polybot?start=ref_${user.refCode || 'CUSTOM'}`;
            const keyboard = [
                [{ text: 'Ver Status', callback_data: 'check_status' }],
                [{ text: 'Abrir Dashboard', callback_data: 'open_dashboard' }],
                [{ text: 'Ajuda', callback_data: 'help' }]
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
                case 'trader_custom':
                    yield this.sendMessage(chatId, 'Por favor, digite o endereco do trader que deseja copiar:');
                    break;
                case 'strategy_percentage':
                    yield this.handleStrategySelection(chatId, 'PERCENTAGE', 10.0);
                    break;
                case 'strategy_percentage_custom':
                    yield this.sendMessage(chatId, 'Por favor, digite o percentual que deseja copiar (ex: 5, 10, 20):');
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
                case 'open_dashboard':
                    yield this.sendMessage(chatId, 'Dashboard disponivel em: http://localhost:3000\n\nUse este link no seu navegador para acessar o painel de controle do PolyCopy.');
                    break;
                case 'help':
                    yield this.sendHelp(chatId);
                    break;
                case 'reconfigure':
                    yield this.handleReconfigure(chatId);
                    break;
                case 'reconfig_trader':
                    yield this.handleTraderSelection(chatId, '');
                    break;
                case 'reconfig_strategy':
                    yield this.handleStrategySelection(chatId, 'RECONFIGURE', 0);
                    break;
                default:
                    yield this.sendMessage(chatId, 'Opcao nao reconhecida. Tente novamente.');
            }
        });
    }
    sendStatus(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const user = this.users.get(chatId);
            if (!user)
                return;
            const statusMessage = `STATUS DO SEU BOT

Carteira: ${((_a = user.wallet) === null || _a === void 0 ? void 0 : _a.address) || 'Nao configurada'}
Trader: ${((_b = user.config) === null || _b === void 0 ? void 0 : _b.traderAddress) || 'Nao configurado'}
Estrategia: ${((_c = user.config) === null || _c === void 0 ? void 0 : _c.strategy) || 'Nao configurada'}
Step: ${user.step || 'Nao iniciado'}

Dashboard: http://localhost:3000
API Docs: http://localhost:3000/docs`;
            yield this.sendMessage(chatId, statusMessage);
        });
    }
    sendHelp(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const helpMessage = `AJUDA - POLYCOPY BOT

COMANDOS:
/start - Iniciar configuracao
/status - Ver status atual
/wallet - Informacoes da carteira
/config - Ver configuracoes
/help - Esta mensagem de ajuda

LINKS UTEIS:
Dashboard: http://localhost:3000
API Docs: http://localhost:3000/docs

SUPORTE:
Se precisar de ajuda, contate nosso suporte.

IMPORTANTE:
- Nunca compartilhe sua chave privada
- Mantenha seu bot atualizado
- Monitore suas operacoes regularmente`;
            yield this.sendMessage(chatId, helpMessage);
        });
    }
    handleReconfigure(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = this.users.get(chatId);
            if (!user)
                return;
            const reconfigureMessage = `RECONFIGURAR SEU BOT

O que voce gostaria de reconfigurar?

1. Trocar Trader
   Alterar o trader que voce esta copiando

2. Alterar Estrategia
   Mudar percentual ou tipo de estrategia

3. Gerar Nova Carteira
   ATENCAO: Isso ira criar uma nova carteira e substituir a atual

4. Ver Configuracoes Atuais
   Revisar todas as configuracoes atuais

Escolha uma opcao:`;
            const keyboard = [
                [{ text: 'Trocar Trader', callback_data: 'reconfig_trader' }],
                [{ text: 'Alterar Estrategia', callback_data: 'reconfig_strategy' }],
                [{ text: 'Gerar Nova Carteira', callback_data: 'generate_wallet' }],
                [{ text: 'Ver Configuracoes', callback_data: 'check_status' }]
            ];
            yield this.sendMessage(chatId, reconfigureMessage, keyboard);
        });
    }
    handleMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            const chatId = message.chat.id.toString();
            const text = message.text;
            const user = this.users.get(chatId);
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
            else if ((user === null || user === void 0 ? void 0 : user.step) === 'trader' && text && text.startsWith('0x')) {
                // Handle custom trader address input
                yield this.handleTraderSelection(chatId, text);
            }
            else if ((user === null || user === void 0 ? void 0 : user.step) === 'strategy' && text && !isNaN(parseFloat(text))) {
                // Handle custom percentage input
                const percentage = parseFloat(text);
                if (percentage > 0 && percentage <= 100) {
                    yield this.handleStrategySelection(chatId, 'PERCENTAGE', percentage);
                }
                else {
                    yield this.sendMessage(chatId, 'Percentual invalido. Por favor, digite um valor entre 1 e 100:');
                }
            }
        });
    }
}
export default TelegramBotSimple;
