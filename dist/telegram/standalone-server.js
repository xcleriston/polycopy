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
import TelegramBotStandalone from './standalone';
class TelegramStandaloneServer {
    constructor(token) {
        this.token = token;
        this.bot = new TelegramBotStandalone(token);
    }
    startPolling() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('🤖 Iniciando bot Telegram standalone...');
            console.log(`📱 Bot: https://t.me/PolyCop_BOT`);
            console.log('⏳ Aguardando mensagens...');
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
                    console.error('Erro no polling:', error);
                    yield new Promise(resolve => setTimeout(resolve, 5000));
                }
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
export default TelegramStandaloneServer;
