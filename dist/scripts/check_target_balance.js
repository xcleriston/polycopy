var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import getMyBalance from '../utils/getMyBalance.js';
import * as dotenv from 'dotenv';
dotenv.config();
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        const addr = '0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B'.toLowerCase();
        const bal = yield getMyBalance(addr);
        console.log(`Saldo de ${addr}: $${bal}`);
    });
}
check();
