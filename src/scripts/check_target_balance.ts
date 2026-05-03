import getMyBalance from '../utils/getMyBalance.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
    const addr = '0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B'.toLowerCase();
    const bal = await getMyBalance(addr);
    console.log(`Saldo de ${addr}: $${bal}`);
}
check();
