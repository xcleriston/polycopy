var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import axios from 'axios';
import TelegramBot from './bot.js';
import Logger from '../utils/logger.js';
class TelegramServer {
    constructor(token, webhookUrl) {
        this.token = token;
        this.webhookUrl = webhookUrl;
        this.bot = new TelegramBot(token);
    }
    startPolling() {
        return __awaiter(this, void 0, void 0, function* () {
            Logger.info('🤖 Iniciando bot Telegram (polling)...');
            try {
                const botInfo = yield this.getBotInfo();
                if (botInfo) {
                    Logger.success(`📱 Bot Telegram online: @${botInfo.username}`);
                }
            }
            catch (e) { }
            Logger.info('⏳ Aguardando mensagens...');
            let lastUpdate = 0;
            while (true) {
                try {
                    const response = yield axios.get(`https://api.telegram.org/bot${this.token}/getUpdates?offset=${lastUpdate + 1}&timeout=30`);
                    const updates = response.data.result;
                    for (const update of updates) {
                        lastUpdate = update.update_id;
                        if (update.message) {
                            yield this.bot.handleMessage(update.message);
                        }
                        else if (update.callback_query) {
                            yield this.bot.handleCallback(update.callback_query.data, update.callback_query.message.chat.id.toString());
                            // Answer callback query
                            yield axios.post(`https://api.telegram.org/bot${this.token}/answerCallbackQuery`, {
                                callback_query_id: update.callback_query.id,
                                text: 'Processando...'
                            });
                        }
                    }
                    // Wait before next request
                    yield new Promise(resolve => setTimeout(resolve, 1000));
                }
                catch (error) {
                    Logger.error(`Erro no polling do Telegram: ${error.message || error}`);
                    yield new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        });
    }
    setWebhook() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.webhookUrl) {
                console.log('⚠️ Webhook URL não configurada, usando polling...');
                return;
            }
            try {
                yield axios.post(`https://api.telegram.org/bot${this.token}/setWebhook`, {
                    url: this.webhookUrl
                });
                console.log(`✅ Webhook configurado: ${this.webhookUrl}`);
            }
            catch (error) {
                console.error('Erro ao configurar webhook:', error);
            }
        });
    }
    getBotInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield axios.get(`https://api.telegram.org/bot${this.token}/getMe`);
                return response.data.result;
            }
            catch (error) {
                console.error('Erro ao obter informações do bot:', error);
                return null;
            }
        });
    }
}
export default TelegramServer;
