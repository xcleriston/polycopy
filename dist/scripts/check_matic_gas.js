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
import * as dotenv from 'dotenv';
dotenv.config();
const EOA = '0xC25C4CECd118E1F90b8D7fb41f19e1E9ef687FF3';
const PROXY = '0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B';
const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/VDsFz_Ooaj0-4vaVrIxOd';
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = new ethers.providers.JsonRpcProvider(RPC);
        const [bEoa, bProxy] = yield Promise.all([
            provider.getBalance(EOA),
            provider.getBalance(PROXY)
        ]);
        console.log(`EOA MATIC: ${ethers.utils.formatEther(bEoa)}`);
        console.log(`PROXY MATIC: ${ethers.utils.formatEther(bProxy)}`);
    });
}
check();
