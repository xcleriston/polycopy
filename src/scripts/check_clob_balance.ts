import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import getMyBalance from '../utils/getMyBalance.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkClob() {
    const addr = '0x3d4C1355998710Aa9E05dA9FaDBD68514A1238CA';
    console.log(`Checking CLOB for: ${addr}`);
    
    // We can't check CLOB balance for arbitrary addresses without an authenticated client
    // because getBalanceAllowance requires L2 authentication.
    // However, for Gnosis Safe users, we can check the balance via RPC.
    
    const bal = await getMyBalance(addr);
    console.log(`RPC Balance: $${bal}`);
}
checkClob();
