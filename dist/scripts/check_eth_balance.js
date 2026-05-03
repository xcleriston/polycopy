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
const ETH_RPC = 'https://ethereum-rpc.publicnode.com';
const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_ABI = ['function balanceOf(address account) view returns (uint256)'];
function checkEth() {
    return __awaiter(this, void 0, void 0, function* () {
        const addr = '0x3075a90F9bdAC075EBb018b074a69E7f5B98D8D6'.toLowerCase();
        const provider = new ethers.providers.JsonRpcProvider(ETH_RPC);
        const usdc = new ethers.Contract(USDC_ETH, USDC_ABI, provider);
        try {
            const bal = yield usdc.balanceOf(addr);
            console.log(`Ethereum USDC Balance for ${addr}: $${ethers.utils.formatUnits(bal, 6)}`);
            const ethBal = yield provider.getBalance(addr);
            console.log(`Ethereum ETH Balance for ${addr}: ${ethers.utils.formatEther(ethBal)} ETH`);
        }
        catch (e) {
            console.error(e.message);
        }
    });
}
checkEth();
