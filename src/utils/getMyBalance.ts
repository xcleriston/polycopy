import { ethers } from 'ethers';
import { ENV } from '../config/env.js';

const RPC_URL = ENV.RPC_URL;
const USDC_CONTRACT_ADDRESS = ENV.USDC_CONTRACT_ADDRESS;

const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];
const NATIVE_USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';

const getMyBalance = async (address: string, proxy?: string): Promise<number> => {
    try {
        const rpcProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const targetAddress = proxy || address;
        
        // 1. Check Native USDC (Circle)
        const nativeContract = new ethers.Contract(NATIVE_USDC, USDC_ABI, rpcProvider);
        const nativeBalance = await nativeContract.balanceOf(targetAddress);
        
        // 2. Check Bridged USDC (USDC.e) - fallback/legacy
        const bridgedContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, rpcProvider);
        const bridgedBalance = await bridgedContract.balanceOf(targetAddress);
        
        const totalRaw = nativeBalance.add(bridgedBalance);
        const balance_usdc_real = ethers.utils.formatUnits(totalRaw, 6);
        
        return parseFloat(balance_usdc_real);
    } catch (error) {
        console.error(`Error fetching balance for ${address} (Proxy: ${proxy}):`, error);
        return 0;
    }
};

export default getMyBalance;
