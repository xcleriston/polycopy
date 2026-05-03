import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const RPC_URLS = [
    'https://polygon-mainnet.g.alchemy.com/v2/VDsFz_Ooaj0-4vaVrIxOd',
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.quiknode.pro'
];

const USDC_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

const NATIVE_USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const BRIDGED_USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

async function checkBoth() {
    const addr = '0x3075a90F9bdAC075EBb018b074a69E7f5B98D8D6';
    const provider = new ethers.providers.JsonRpcProvider(RPC_URLS[0]);
    
    const nativeContract = new ethers.Contract(NATIVE_USDC, USDC_ABI, provider);
    const bridgedContract = new ethers.Contract(BRIDGED_USDC, USDC_ABI, provider);
    
    try {
        const [nativeBal, bridgedBal] = await Promise.all([
            nativeContract.balanceOf(addr).catch(() => ethers.BigNumber.from(0)),
            bridgedContract.balanceOf(addr).catch(() => ethers.BigNumber.from(0))
        ]);
        
        console.log(`Address: ${addr}`);
        console.log(`Native USDC (0x3c49...): $${ethers.utils.formatUnits(nativeBal, 6)}`);
        console.log(`Bridged USDC (0x2791...): $${ethers.utils.formatUnits(bridgedBal, 6)}`);
    } catch (e) {
        console.error(e);
    }
}

checkBoth();
