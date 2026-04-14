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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const isEnabled = () => !!TELEGRAM_BOT_TOKEN;
const send = (chatId, message) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isEnabled() || !chatId)
        return;
    try {
        yield axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: chatId, text: message, parse_mode: 'Markdown' }, { timeout: 5000 });
    }
    catch (_a) {
        // Silently fail to avoid disrupting trading
    }
});
const telegram = {
    isEnabled,
    send,
    tradeExecuted: (chatId, side, amount, price, market) => send(chatId, `✅ *${side}* $${amount.toFixed(2)} @ $${price.toFixed(4)}\n📊 ${market}`),
    killSwitch: (chatId, lossPct) => send(chatId, `🛑 *KILL SWITCH TRIGGERED*\nDaily loss: ${lossPct.toFixed(1)}%\nTrading halted.`),
    error: (chatId, msg) => send(chatId, `❌ *Error*: ${msg}`),
    startup: (chatId, traderCount, balance) => send(chatId, `🚀 *Bot Started*\nTracking ${traderCount} trader(s)\nBalance: $${balance.toFixed(2)}`),
    tpSlTriggered: (chatId, message) => send(chatId, `🛡️ *RISK MANAGEMENT*\n${message}`),
};
export default telegram;
