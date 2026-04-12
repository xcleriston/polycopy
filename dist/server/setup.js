"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWallet = createWallet;
exports.findPolymarketProxy = findPolymarketProxy;
exports.generateDepositLinks = generateDepositLinks;
exports.updateEnvFile = updateEnvFile;
exports.setupNewUser = setupNewUser;
const ethers_1 = require("ethers");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function createWallet() {
    return __awaiter(this, void 0, void 0, function* () {
        const wallet = ethers_1.ethers.Wallet.createRandom();
        return {
            address: wallet.address,
            privateKey: wallet.privateKey
        };
    });
}
function findPolymarketProxy(eoaAddress) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const RPC_URL = process.env.RPC_URL || 'https://poly.api.pocket.network';
            const provider = new ethers_1.ethers.providers.JsonRpcProvider(RPC_URL);
            // Polymarket Proxy Factory on Polygon
            const POLYMARKET_PROXY_FACTORY = '0xab45c5a4b0c941a2f231c04c3f49182e1a254052';
            const proxyFactoryAbi = ['event ProxyCreation(address indexed proxy, address singleton)'];
            const polymarketProxyFactory = new ethers_1.ethers.Contract(POLYMARKET_PROXY_FACTORY, proxyFactoryAbi, provider);
            const latestBlock = yield provider.getBlockNumber();
            const fromBlock = Math.max(0, latestBlock - 10000000);
            const events = yield polymarketProxyFactory.queryFilter(polymarketProxyFactory.filters.ProxyCreation(null, null), fromBlock, latestBlock);
            for (const event of events) {
                // Check if this proxy belongs to our EOA (simplified check)
                // In real implementation, you'd need to check ownership
                if (event.args && event.args.proxy) {
                    return event.args.proxy;
                }
            }
            return null;
        }
        catch (error) {
            console.error('Error finding proxy:', error);
            return null;
        }
    });
}
function generateDepositLinks(walletAddress) {
    return {
        usdc: `https://wallet.polygon.technology/polygon/bridge/deposit?to=${walletAddress}`,
        pol: `https://www.coingecko.com/en/coins/polygon?utm_source=polycopy`,
        quickswap: `https://quickswap.exchange/#/swap?inputCurrency=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174&outputCurrency=0x458Efe634a885F2A2A57B106063e822A060f9dcF&recipient=${walletAddress}`
    };
}
function updateEnvFile(config) {
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
function setupNewUser(request) {
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
