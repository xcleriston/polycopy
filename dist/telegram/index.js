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
const server_1 = __importDefault(require("./server"));
const env_1 = require("../config/env");
const TELEGRAM_BOT_TOKEN = env_1.ENV.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN não encontrado no .env');
    process.exit(1);
}
function startTelegramBot() {
    return __awaiter(this, void 0, void 0, function* () {
        const telegramServer = new server_1.default(TELEGRAM_BOT_TOKEN);
        // Get bot info
        const botInfo = yield telegramServer.getBotInfo();
        if (botInfo) {
            console.log(`🤖 Bot Telegram: @${botInfo.username}`);
            console.log(`📱 Nome: ${botInfo.first_name}`);
            console.log(`🔗 Link: https://t.me/${botInfo.username}`);
        }
        // Start polling (simpler than webhook for local testing)
        yield telegramServer.startPolling();
    });
}
startTelegramBot().catch(console.error);
