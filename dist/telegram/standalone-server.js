"use strict";
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
const axios_1 = __importDefault(require("axios"));
const standalone_1 = __importDefault(require("./standalone"));
class TelegramStandaloneServer {
    constructor(token) {
        this.token = token;
        this.bot = new standalone_1.default(token);
    }
    startPolling() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('🤖 Iniciando bot Telegram standalone...');
            console.log(`📱 Bot: https://t.me/PolyCop_BOT`);
            console.log('⏳ Aguardando mensagens...');
            let lastUpdate = 0;
            while (true) {
                try {
                    const response = yield axios_1.default.get(`https://api.telegram.org/bot${this.token}/getUpdates?offset=${lastUpdate + 1}&timeout=30`);
                    const updates = response.data.result;
                    for (const update of updates) {
                        lastUpdate = update.update_id;
                        if (update.message) {
                            yield this.bot.handleMessage(update.message);
                        }
                        else if (update.callback_query) {
                            yield this.bot.handleCallback(update.callback_query.data, update.callback_query.message.chat.id.toString());
                            // Answer callback query
                            yield axios_1.default.post(`https://api.telegram.org/bot${this.token}/answerCallbackQuery`, {
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
                const response = yield axios_1.default.get(`https://api.telegram.org/bot${this.token}/getMe`);
                return response.data.result;
            }
            catch (error) {
                console.error('Erro ao obter informações do bot:', error);
                return null;
            }
        });
    }
}
exports.default = TelegramStandaloneServer;
