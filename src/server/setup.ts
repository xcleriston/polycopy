import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

interface SetupRequest {
    traderAddress?: string;
    initialAmount?: number;
    strategy?: string;
    copySize?: number;
    telegramToken?: string;
}

interface SetupResponse {
    success: boolean;
    wallet?: {
        address: string;
        privateKey: string;
    };
    proxyWallet?: string;
    config?: {
        traderAddress: string;
        strategy: string;
        copySize: number;
        previewMode: boolean;
    };
    depositLinks?: {
        usdc: string;
        pol: string;
    };
    error?: string;
}

export async function createWallet(): Promise<{ address: string; privateKey: string }> {
    const wallet = ethers.Wallet.createRandom();
    return {
        address: wallet.address,
        privateKey: wallet.privateKey
    };
}

/**
 * V2: descobre o proxyWallet de uma EOA via Polymarket Gamma /public-profile.
 * É a fonte da verdade — Polymarket retorna o proxy real associado ao address.
 * Pra wallets nunca usadas em polymarket.com, retorna null (esperado).
 *
 * O implementation antigo tentava varrer eventos de uma factory antiga e nunca
 * funcionou (sempre retornava o primeiro proxy aleatório do scan, ignorando owner).
 */
export async function findPolymarketProxy(eoaAddress: string): Promise<string | null> {
    try {
        const gamma = (process.env.GAMMA_HTTP_URL ?? 'https://gamma-api.polymarket.com').replace(/\/$/, '');
        const r = await fetch(`${gamma}/public-profile?address=${eoaAddress}`);
        if (!r.ok) return null;
        const profile: any = await r.json();
        return profile?.proxyWallet ?? null;
    } catch (error) {
        console.error('[setup] findPolymarketProxy failed:', error);
        return null;
    }
}

export function generateDepositLinks(walletAddress: string) {
    return {
        usdc: `https://wallet.polygon.technology/polygon/bridge/deposit?to=${walletAddress}`,
        pol: `https://www.coingecko.com/en/coins/polygon?utm_source=polycopy`,
        quickswap: `https://quickswap.exchange/#/swap?inputCurrency=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174&outputCurrency=0x458Efe634a885F2A2A57B106063e822A060f9dcF&recipient=${walletAddress}`
    };
}

export async function updateEnvFile(config: Partial<SetupRequest & { privateKey: string; proxyWallet: string }>) {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    // Read existing .env if it exists
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
    }
    
    // Update or add each configuration
    const updates = [
        { key: 'USER_ADDRESSES', value: config.traderAddress || '' },
        { key: 'PROXY_WALLET', value: config.proxyWallet || '' },
        { key: 'PRIVATE_KEY', value: config.privateKey || '' },
        { key: 'COPY_STRATEGY', value: config.strategy || 'PERCENTAGE' },
        { key: 'COPY_SIZE', value: config.copySize?.toString() || '10.0' },
        { key: 'PREVIEW_MODE', value: 'true' },
        { key: 'TELEGRAM_BOT_TOKEN', value: config.telegramToken || '' },
    ];
    
    updates.forEach(({ key, value }) => {
        const regex = new RegExp(`^${key}\\s*=.*$`, 'm');
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}='${value}'`);
        } else {
            envContent += `\n${key}='${value}'`;
        }
    });
    
    // Write updated .env
    fs.writeFileSync(envPath, envContent);
}

export async function setupNewUser(request: SetupRequest): Promise<SetupResponse> {
    try {
        // 1. Create new wallet
        const wallet = await createWallet();
        
        // 2. Find or create proxy wallet
        const proxyWallet = await findPolymarketProxy(wallet.address) || wallet.address;
        
        // 3. Generate deposit links
        const depositLinks = generateDepositLinks(wallet.address);
        
        // 4. Update .env file
        await updateEnvFile({
            ...request,
            privateKey: wallet.privateKey,
            proxyWallet: proxyWallet
        });
        
        return {
            success: true,
            wallet: {
                address: wallet.address,
                privateKey: wallet.privateKey
            },
            proxyWallet: proxyWallet,
            config: {
                traderAddress: request.traderAddress || '0x2005d16a84ceefa912d4e380cd32e7ff827875ea',
                strategy: request.strategy || 'PERCENTAGE',
                copySize: request.copySize || 10.0,
                previewMode: true
            },
            depositLinks: depositLinks
        };
        
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
