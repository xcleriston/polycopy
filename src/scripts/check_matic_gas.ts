import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const EOA = '0xC25C4CECd118E1F90b8D7fb41f19e1E9ef687FF3';
const PROXY = '0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B';
const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/VDsFz_Ooaj0-4vaVrIxOd';

async function check() {
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    const [bEoa, bProxy] = await Promise.all([
        provider.getBalance(EOA),
        provider.getBalance(PROXY)
    ]);
    console.log(`EOA MATIC: ${ethers.utils.formatEther(bEoa)}`);
    console.log(`PROXY MATIC: ${ethers.utils.formatEther(bProxy)}`);
}
check();
