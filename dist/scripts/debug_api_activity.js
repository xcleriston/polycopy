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
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        const addr = '0xb54101496b7078873447869c1804b2f85a3d1852';
        const url = `https://data-api.polymarket.com/activity?user=${addr}&type=TRADE`;
        try {
            const res = yield axios.get(url, { timeout: 10000 });
            console.log("Recent Trades from API:");
            res.data.slice(0, 5).forEach((t) => {
                console.log(`[${new Date(t.timestamp * 1000).toLocaleString()}] ${t.title || t.slug}`);
            });
        }
        catch (e) {
            console.error("Error:", e.message);
        }
    });
}
check();
