import { ethers } from 'ethers';

async function check() {
    const addr = '0x3075a90F9bdAC075EBb018b074a69E7f5B98D8D6'.toLowerCase();
    const provider = new ethers.providers.JsonRpcProvider('https://polygon-mainnet.g.alchemy.com/v2/VDsFz_Ooaj0-4vaVrIxOd');
    const bal = await provider.getBalance(addr);
    console.log(`MATIC Balance for ${addr}: ${ethers.utils.formatEther(bal)} MATIC`);
}
check();
