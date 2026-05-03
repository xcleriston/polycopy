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
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        const addr = '0x3075a90F9bdAC075EBb018b074a69E7f5B98D8D6'.toLowerCase();
        const provider = new ethers.providers.JsonRpcProvider('https://polygon-mainnet.g.alchemy.com/v2/VDsFz_Ooaj0-4vaVrIxOd');
        const bal = yield provider.getBalance(addr);
        console.log(`MATIC Balance for ${addr}: ${ethers.utils.formatEther(bal)} MATIC`);
    });
}
check();
