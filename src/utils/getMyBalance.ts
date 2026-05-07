import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { ENV } from '../config/env.js';
import Logger from './logger.js';

const USDC_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

// V2 cutover (2026-04-28): collateral mudou pra pUSD. Mas users em transição
// podem ter saldo em ambos (pUSD novo + USDC.e legacy). Lemos os dois e somamos.
const PUSD_ADDRESS = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';        // V2 collateral
const USDC_E_LEGACY_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // V1 legacy

const RPC_LIST = [
    ENV.RPC_URL,
    process.env.RPC_HTTP_URL,
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.quiknode.pro',
    'https://1rpc.io/matic',
    'https://polygon.llamarpc.com'
].filter(Boolean) as string[];

/**
 * Fetches Polymarket collateral balance for an address.
 * V2 native = pUSD. Lê pUSD + USDC.e legacy e soma (pra cobrir transição V1→V2
 * onde users podem ter saldo nos dois). ENV.USDC_CONTRACT_ADDRESS, se setado,
 * sobrescreve o pUSD default (escape hatch p/ testes).
 *
 * Suporta ClobClient (accurate for CLOB funds) ou wallet address (RPC check).
 */
const getMyBalance = async (clientOrAddress: ClobClient | string): Promise<number> => {
    try {
        if (typeof clientOrAddress === 'string') {
            const address = clientOrAddress;
            // V2: collateral é pUSD. Lemos pUSD + USDC.e legacy e somamos.
            // Ignoramos ENV.USDC_CONTRACT_ADDRESS — em .env legados ele aponta
            // pra USDC.e (V1), o que mascararia saldo pUSD do user. Ler sempre
            // pUSD via constante hardcoded é mais correto pós-cutover.
            for (const rpc of RPC_LIST) {
                try {
                    const provider = new ethers.providers.JsonRpcProvider({
                        url: rpc,
                        skipFetchSetup: true // Some RPCs hate the default headers
                    }, 137);

                    const pusd = new ethers.Contract(PUSD_ADDRESS, USDC_ABI, provider);
                    const usdcE = new ethers.Contract(USDC_E_LEGACY_ADDRESS, USDC_ABI, provider);
                    // Não usar .catch interno aqui — se o RPC falhar, queremos que o
                    // outer catch caia pro próximo RPC. Catch silencioso retornaria 0
                    // falso mesmo quando o saldo real é > 0.
                    const [pusdRaw, usdcERaw] = await Promise.all([
                        pusd.balanceOf(address),
                        usdcE.balanceOf(address),
                    ]);
                    const pusdBal = parseFloat(ethers.utils.formatUnits(pusdRaw, 6));
                    const usdcEBal = parseFloat(ethers.utils.formatUnits(usdcERaw, 6));
                    let finalBalance = pusdBal + usdcEBal;

                    // PARANOID CHECK: If formatted balance is > 100M USD, something is wrong with the decimal shift
                    if (finalBalance > 100000000) {
                        Logger.warning(`[BALANCE] Suspiciously high balance ($${finalBalance}) for ${address.slice(0,6)}. Applying emergency 10^6 division.`);
                        finalBalance /= 1000000;
                    }

                    if (finalBalance > 0) {
                        Logger.info(`[BALANCE] $${finalBalance.toFixed(4)} for ${address.slice(0,6)} (pUSD=$${pusdBal.toFixed(4)} + USDC.e=$${usdcEBal.toFixed(4)}) via ${rpc}`);
                    }
                    return finalBalance;
                } catch (rpcErr) {
                    Logger.warning(`[BALANCE] RPC ${rpc} failed for ${address.slice(0,6)}: ${rpcErr instanceof Error ? rpcErr.message : 'Unknown'}`);
                    continue;
                }
            }
            throw new Error("All RPCs failed");
        } else {
            // ACCURATE CLOB CHECK
            const funder = (clientOrAddress as any).orderBuilder?.funderAddress;
            Logger.debug(`[BALANCE] Fetching CLOB balance for funder: ${funder || 'Signer'}`);
            
            const balanceData = await clientOrAddress.getBalanceAllowance({
                asset_type: "COLLATERAL" as any,
                funder: funder as any
            } as any);
            
            Logger.debug(`[BALANCE] CLOB Raw Response: ${JSON.stringify(balanceData)}`);

            const raw = balanceData.balance || "0";
            const val = parseFloat(raw);

            // CLOB API returns balance as raw 6-decimal USDC units (string).
            // Heuristic: if the raw string has > 6 chars (or is an integer with no
            // decimal point), treat it as raw units and divide by 10^6.
            // This avoids previous bug where balances < $1 weren't normalized.
            const looksRaw = !raw.includes('.') && raw.length > 4;
            if (looksRaw || val > 1000) {
                return val / 1_000_000;
            }
            return val;
        }
    } catch (e: any) {
        Logger.error(`[BALANCE] Critical failure for ${typeof clientOrAddress === 'string' ? clientOrAddress : 'Client'}: ${e.message}`);
        return 0;
    }
};

export default getMyBalance;
