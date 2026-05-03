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
function checkClob() {
    return __awaiter(this, void 0, void 0, function* () {
        const addr = '0x3d4C1355998710Aa9E05dA9FaDBD68514A1238CA';
        console.log(`Checking CLOB for: ${addr}`);
        // We can't check CLOB balance for arbitrary addresses without an authenticated client
        // because getBalanceAllowance requires L2 authentication.
        // However, for Gnosis Safe users, we can check the balance via RPC.
        const bal = yield getMyBalance(addr);
        console.log(`RPC Balance: $${bal}`);
    });
}
checkClob();
