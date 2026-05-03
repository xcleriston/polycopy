import { ethers } from 'ethers';

const POLYGON_RPC = 'https://polygon-mainnet.g.alchemy.com/v2/VDsFz_Ooaj0-4vaVrIxOd';
const ETH_RPC = 'https://ethereum-rpc.publicnode.com';

const NATIVE_USDC_POLY = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const BRIDGED_USDC_POLY = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

async function checkAll(addr: string) {
    console.log(`\n--- Checking ${addr} ---`);
    
    // Polygon
    const polyProvider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
    console.log("Network: Polygon");
    const matic = await polyProvider.getBalance(addr);
    console.log(`  MATIC: ${ethers.utils.formatEther(matic)}`);
    
    const nativePoly = new ethers.Contract(NATIVE_USDC_POLY, ABI, polyProvider);
    const balNativePoly = await nativePoly.balanceOf(addr);
    console.log(`  Native USDC: ${ethers.utils.formatUnits(balNativePoly, 6)}`);
    
    const bridgedPoly = new ethers.Contract(BRIDGED_USDC_POLY, ABI, polyProvider);
    const balBridgedPoly = await bridgedPoly.balanceOf(addr);
    console.log(`  Bridged USDC: ${ethers.utils.formatUnits(balBridgedPoly, 6)}`);

    // Ethereum
    try {
        const ethProvider = new ethers.providers.JsonRpcProvider(ETH_RPC);
        console.log("Network: Ethereum");
        const eth = await ethProvider.getBalance(addr);
        console.log(`  ETH: ${ethers.utils.formatEther(eth)}`);
        
        const usdcEth = new ethers.Contract(USDC_ETH, ABI, ethProvider);
        const balUsdcEth = await usdcEth.balanceOf(addr);
        console.log(`  USDC: ${ethers.utils.formatUnits(balUsdcEth, 6)}`);
    } catch (e) { console.log("  Ethereum check failed"); }
}

async function start() {
    const addresses = [
        '0xC25C4CECd118E1F90b8D7fb41f19e1E9ef687FF3',
        '0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B',
        '0x3075a90F9bdAC075EBb018b074a69E7f5B98D8D6',
        '0x3d4C1355998710Aa9E05dA9FaDBD68514A1238CA'
    ];
    for (const a of addresses) {
        await checkAll(a.toLowerCase());
    }
}

start();
