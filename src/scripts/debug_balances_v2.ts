import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/VDsFz_Ooaj0-4vaVrIxOd';
const NATIVE_USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const BRIDGED_USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

async function checkAll(addr: string) {
    console.log(`\n--- Checking ${addr} ---`);
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    
    // MATIC
    const matic = await provider.getBalance(addr);
    console.log(`MATIC: ${ethers.utils.formatEther(matic)}`);
    
    // Native USDC
    try {
        const native = new ethers.Contract(NATIVE_USDC, ABI, provider);
        const bal = await native.balanceOf(addr);
        console.log(`Native USDC: ${ethers.utils.formatUnits(bal, 6)}`);
    } catch (e) { console.log("Native USDC check failed"); }
    
    // Bridged USDC
    try {
        const bridged = new ethers.Contract(BRIDGED_USDC, ABI, provider);
        const bal = await bridged.balanceOf(addr);
        console.log(`Bridged USDC: ${ethers.utils.formatUnits(bal, 6)}`);
    } catch (e) { console.log("Bridged USDC check failed"); }
}

async function start() {
    await checkAll('0xC25C4CECd118E1F90b8D7fb41f19e1E9ef687FF3'.toLowerCase());
    await checkAll('0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B'.toLowerCase());
    await checkAll('0x3075a90F9bdAC075EBb018b074a69E7f5B98D8D6'.toLowerCase());
    await checkAll('0x3d4C1355998710Aa9E05dA9FaDBD68514A1238CA'.toLowerCase());
}

start();
