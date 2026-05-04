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
const USDC_ABI = ["function balanceOf(address account) view returns (uint256)"];
const USDC_NATIVE_ADDR = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // Native USDC
const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/VDsFz_Ooaj0-4vaVrIxOd';
const EOA = '0xC25C4CECd118E1F90b8D7fb41f19e1E9ef687FF3';
const PROXY = '0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B';
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = new ethers.providers.JsonRpcProvider(RPC);
        const usdc = new ethers.Contract(USDC_NATIVE_ADDR, USDC_ABI, provider);
        const [balEoa, balProxy] = yield Promise.all([
            usdc.balanceOf(EOA),
            usdc.balanceOf(PROXY)
        ]);
        console.log(`EOA ${EOA} (Native): ${ethers.utils.formatUnits(balEoa, 6)} USDC`);
        console.log(`PROXY ${PROXY} (Native): ${ethers.utils.formatUnits(balProxy, 6)} USDC`);
    });
}
check();
