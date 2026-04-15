var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import fetchData from '../utils/fetchData.js';
export function createWallet() {
    return __awaiter(this, void 0, void 0, function* () {
        const wallet = ethers.Wallet.createRandom();
        return {
            address: wallet.address,
            privateKey: wallet.privateKey
        };
    });
}
export function findPolymarketProxy(eoaAddress) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const endpoints = [
                `https://data-api.polymarket.com/profiles/${eoaAddress}`,
                `https://data-api.polymarket.com/activity?user=${eoaAddress}`,
                `https://data-api.polymarket.com/positions?user=${eoaAddress}`
            ];
            for (const url of endpoints) {
                try {
                    const res = yield fetchData(url);
                    // Handle profile object
                    if (res && res.proxyWallet) {
                        console.log(`[PROXY] Detected via ${url}: ${res.proxyWallet}`);
                        return res.proxyWallet;
                    }
                    // Handle activity/positions array
                    if (Array.isArray(res) && res.length > 0 && res[0].proxyWallet) {
                        console.log(`[PROXY] Detected via ${url}: ${res[0].proxyWallet}`);
                        return res[0].proxyWallet;
                    }
                }
                catch (e) {
                    // Best effort
                }
            }
            // Method 2: Fallback to event scanning
            const RPC_URL = process.env.RPC_URL || 'https://poly.api.pocket.network';
            const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
            const POLYMARKET_PROXY_FACTORY = '0xab45c5a4b0c941a2f231c04c3f49182e1a254052';
            const proxyFactoryAbi = ['event ProxyCreation(address indexed proxy, address singleton)'];
            const polymarketProxyFactory = new ethers.Contract(POLYMARKET_PROXY_FACTORY, proxyFactoryAbi, provider);
            const latestBlock = yield provider.getBlockNumber();
            const fromBlock = Math.max(0, latestBlock - 5000); // Only scan recent blocks for RPC stability
            const events = yield polymarketProxyFactory.queryFilter(polymarketProxyFactory.filters.ProxyCreation(null, null), fromBlock, latestBlock);
            for (const event of events) {
                if (event.args && event.args.proxy)
                    return event.args.proxy;
            }
            return null;
        }
        catch (error) {
            console.error('Error finding proxy:', error);
            return null;
        }
    });
}
export function generateDepositLinks(walletAddress) {
    return {
        usdc: `https://wallet.polygon.technology/polygon/bridge/deposit?to=${walletAddress}`,
        pol: `https://www.coingecko.com/en/coins/polygon?utm_source=polycopy`,
        quickswap: `https://quickswap.exchange/#/swap?inputCurrency=0x3c499c542cef5e3811e1192ce70d8cc03d5c3359&outputCurrency=0x458Efe634a885F2A2A57B106063e822A060f9dcF&recipient=${walletAddress}`
    };
}
export function updateEnvFile(config) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
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
            { key: 'COPY_SIZE', value: ((_a = config.copySize) === null || _a === void 0 ? void 0 : _a.toString()) || '10.0' },
            { key: 'PREVIEW_MODE', value: 'true' },
            { key: 'TELEGRAM_BOT_TOKEN', value: config.telegramToken || '' },
        ];
        updates.forEach(({ key, value }) => {
            const regex = new RegExp(`^${key}\\s*=.*$`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}='${value}'`);
            }
            else {
                envContent += `\n${key}='${value}'`;
            }
        });
        // Write updated .env
        fs.writeFileSync(envPath, envContent);
    });
}
export function setupNewUser(request) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 1. Create new wallet
            const wallet = yield createWallet();
            // 2. Find or create proxy wallet
            const proxyWallet = (yield findPolymarketProxy(wallet.address)) || wallet.address;
            // 3. Generate deposit links
            const depositLinks = generateDepositLinks(wallet.address);
            // 4. Update .env file
            yield updateEnvFile(Object.assign(Object.assign({}, request), { privateKey: wallet.privateKey, proxyWallet: proxyWallet }));
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
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
}
