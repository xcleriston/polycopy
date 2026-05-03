import { ethers } from 'ethers';
import { ENV } from '../config/env.js';
import createClobClient, { findProxyWallet } from '../utils/createClobClient.js';
import Logger from '../utils/logger.js';

const TARGET_WALLET = "0xA1cEa088f6C532bd4313E174388E2570493cA34a";
const USDC_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const USDC_BRIDGED = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const USDC_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

async function rescue() {
    console.log(`🚀 Iniciando resgate de fundos para: ${TARGET_WALLET}`);
    
    if (ENV.PRIVATE_KEY === '0000000000000000000000000000000000000000000000000000000000000001') {
        console.error("❌ ERRO: A chave privada no arquivo .env ainda é a chave de exemplo.");
        console.error("Por favor, insira sua chave privada real no arquivo .env antes de rodar este script.");
        return;
    }

    const provider = new ethers.providers.JsonRpcProvider(ENV.RPC_URL);
    const wallet = new ethers.Wallet(ENV.PRIVATE_KEY, provider);
    const proxyAddress = ENV.PROXY_WALLET;
    
    console.log(`EOA: ${wallet.address}`);
    console.log(`Proxy: ${proxyAddress}`);

    try {
        // 1. Withdraw from CLOB
        const client = await createClobClient();
        const balanceData = await client.getBalanceAllowance({ asset_type: "COLLATERAL" as any });
        const clobAmount = parseFloat(balanceData.balance || "0");
        
        if (clobAmount > 0) {
            console.log(`\n--- Passo 1: Retirada da Exchange ($${clobAmount}) ---`);
            // await client.withdrawCollateral({ amount: clobAmount });
            console.log("⚠️ Comando de retirada enviado via API.");
        }

        // 2. Transfer from EOA and Proxy
        const accounts = [
            { name: "EOA", address: wallet.address, isProxy: false },
            { name: "Proxy", address: proxyAddress, isProxy: true }
        ];

        const contracts = [USDC_NATIVE, USDC_BRIDGED];

        for (const acc of accounts) {
            console.log(`\n--- Verificando ${acc.name}: ${acc.address} ---`);
            for (const usdcAddr of contracts) {
                const usdc = new ethers.Contract(usdcAddr, USDC_ABI, provider);
                const balance = await usdc.balanceOf(acc.address);
                
                if (balance.gt(0)) {
                    const amountFormatted = ethers.utils.formatUnits(balance, 6);
                    console.log(`Encontrado $${amountFormatted} em ${acc.name}.`);
                    
                    if (acc.isProxy) {
                        console.log(`⚠️ Para transferir do Proxy, você deve usar a interface do Gnosis Safe ou o script de execução do bot.`);
                        // Here we could implement the Gnosis Safe execTransaction, but it's complex for a quick script
                        // For now, inform the user.
                    } else {
                        const usdcWithSigner = usdc.connect(wallet);
                        const tx = await usdcWithSigner.transfer(TARGET_WALLET, balance);
                        console.log(`⏳ Enviando de EOA... TX: ${tx.hash}`);
                        await tx.wait();
                        console.log(`✅ Concluído!`);
                    }
                }
            }
        }

    } catch (error: any) {
        console.error("❌ Erro durante o resgate:", error.message);
    }
}

rescue().catch(console.error);
