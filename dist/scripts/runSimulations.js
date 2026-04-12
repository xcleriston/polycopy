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
const child_process_1 = require("child_process");
const readline = __importStar(require("readline"));
// Colors for console output
const colors = {
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    gray: (text) => `\x1b[90m${text}\x1b[0m`,
    bold: (text) => `\x1b[1m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
};
const DEFAULT_TRADERS = [
    '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
    '0x6bab41a0dc40d6dd4c1a915b8c01969479fd1292',
];
const PRESETS = {
    quick: {
        historyDays: 7,
        maxTrades: 500,
        multipliers: [1.0, 2.0],
        tag: 'quick',
    },
    standard: {
        historyDays: 30,
        maxTrades: 2000,
        multipliers: [0.5, 1.0, 2.0],
        tag: 'std',
    },
    full: {
        historyDays: 90,
        maxTrades: 5000,
        multipliers: [0.5, 1.0, 2.0, 3.0],
        tag: 'full',
    },
};
function runSimulation(config) {
    return new Promise((resolve, reject) => {
        const env = Object.assign(Object.assign({}, process.env), { SIM_TRADER_ADDRESS: config.traderAddress, SIM_HISTORY_DAYS: String(config.historyDays), SIM_MIN_ORDER_USD: String(config.minOrderSize), SIM_MAX_TRADES: String(config.maxTrades || 5000), SIM_RESULT_TAG: config.tag || '', TRADE_MULTIPLIER: String(config.multiplier) });
        console.log(colors.cyan('\n🚀 Starting simulation...'));
        console.log(colors.gray(`   Trader: ${config.traderAddress.slice(0, 10)}...`));
        console.log(colors.gray(`   Days: ${config.historyDays}, Multiplier: ${config.multiplier}x, MinOrder: $${config.minOrderSize}`));
        const child = (0, child_process_1.spawn)('ts-node', ['src/scripts/simulateProfitability.ts'], {
            env,
            stdio: 'inherit',
        });
        child.on('close', (code) => {
            if (code === 0) {
                console.log(colors.green('✓ Simulation completed\n'));
                resolve();
            }
            else {
                console.log(colors.red(`✗ Simulation failed with code ${code}\n`));
                reject(new Error(`Simulation failed with code ${code}`));
            }
        });
        child.on('error', (error) => {
            console.log(colors.red(`✗ Failed to start simulation: ${error.message}\n`));
            reject(error);
        });
    });
}
function runBatch(configs) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(colors.bold(colors.cyan('\n════════════════════════════════════════════════════════════════')));
        console.log(colors.bold(colors.cyan('  📊 BATCH SIMULATION RUNNER')));
        console.log(colors.bold(colors.cyan('════════════════════════════════════════════════════════════════\n')));
        console.log(colors.yellow(`Total simulations to run: ${configs.length}\n`));
        for (let i = 0; i < configs.length; i++) {
            console.log(colors.bold(`\n[${i + 1}/${configs.length}] Running simulation...`));
            try {
                yield runSimulation(configs[i]);
            }
            catch (error) {
                console.log(colors.red(`Simulation ${i + 1} failed, continuing with next...\n`));
            }
            // Small delay between simulations
            if (i < configs.length - 1) {
                yield new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
        console.log(colors.bold(colors.green('\n════════════════════════════════════════════════════════════════')));
        console.log(colors.bold(colors.green('  ✅ ALL SIMULATIONS COMPLETED')));
        console.log(colors.bold(colors.green('════════════════════════════════════════════════════════════════\n')));
    });
}
function generateConfigs(preset, traders) {
    const presetConfig = PRESETS[preset];
    const traderList = traders && traders.length > 0 ? traders : DEFAULT_TRADERS;
    const configs = [];
    for (const trader of traderList) {
        for (const multiplier of presetConfig.multipliers) {
            configs.push({
                traderAddress: trader,
                historyDays: presetConfig.historyDays,
                multiplier,
                minOrderSize: 1.0,
                maxTrades: presetConfig.maxTrades,
                tag: `${presetConfig.tag}_m${multiplier}`.replace('.', 'p'),
            });
        }
    }
    return configs;
}
function interactiveMode() {
    return __awaiter(this, void 0, void 0, function* () {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        const question = (query) => {
            return new Promise((resolve) => rl.question(query, resolve));
        };
        console.log(colors.bold(colors.cyan('\n════════════════════════════════════════════════════════════════')));
        console.log(colors.bold(colors.cyan('  🎮 INTERACTIVE SIMULATION SETUP')));
        console.log(colors.bold(colors.cyan('════════════════════════════════════════════════════════════════\n')));
        // Select preset
        console.log(colors.yellow('Select simulation preset:'));
        console.log('  1. Quick (7 days, 2 multipliers, ~500 trades)');
        console.log('  2. Standard (30 days, 3 multipliers, ~2000 trades) [RECOMMENDED]');
        console.log('  3. Full (90 days, 4 multipliers, ~5000 trades)\n');
        const presetChoice = yield question(colors.cyan('Enter choice (1-3): '));
        const presetMap = {
            '1': 'quick',
            '2': 'standard',
            '3': 'full',
        };
        const preset = presetMap[presetChoice.trim()] || 'standard';
        // Select traders
        console.log(colors.yellow('\nTrader addresses (leave empty for defaults):'));
        console.log(colors.gray('  Default: 0x7c3d... and 0x6bab...\n'));
        const tradersInput = yield question(colors.cyan('Enter addresses (comma-separated) or press Enter: '));
        const traders = tradersInput.trim()
            ? tradersInput.split(',').map((t) => t.trim().toLowerCase())
            : undefined;
        rl.close();
        const configs = generateConfigs(preset, traders);
        yield runBatch(configs);
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const args = process.argv.slice(2);
        if (args.length === 0) {
            // Interactive mode
            yield interactiveMode();
            return;
        }
        const command = args[0];
        switch (command) {
            case 'quick':
                yield runBatch(generateConfigs('quick'));
                break;
            case 'standard':
            case 'std':
                yield runBatch(generateConfigs('standard'));
                break;
            case 'full':
                yield runBatch(generateConfigs('full'));
                break;
            case 'custom': {
                const trader = args[1];
                const days = parseInt(args[2] || '30');
                const multiplier = parseFloat(args[3] || '1.0');
                if (!trader) {
                    console.log(colors.red('Error: Trader address required for custom mode'));
                    console.log(colors.yellow('Usage: npm run sim custom <trader_address> [days] [multiplier]'));
                    return;
                }
                yield runSimulation({
                    traderAddress: trader.toLowerCase(),
                    historyDays: days,
                    multiplier,
                    minOrderSize: 1.0,
                    tag: 'custom',
                });
                break;
            }
            case 'help':
            case '--help':
            case '-h':
                printHelp();
                break;
            default:
                console.log(colors.red(`Unknown command: ${command}\n`));
                printHelp();
                break;
        }
    });
}
function printHelp() {
    console.log(colors.cyan('\n📊 Simulation Runner - Usage\n'));
    console.log('Interactive mode:');
    console.log(colors.yellow('  npm run sim\n'));
    console.log('Preset modes:');
    console.log(colors.yellow('  npm run sim quick      ') + colors.gray('# 7 days, 2 multipliers'));
    console.log(colors.yellow('  npm run sim standard   ') +
        colors.gray('# 30 days, 3 multipliers (recommended)'));
    console.log(colors.yellow('  npm run sim full       ') + colors.gray('# 90 days, 4 multipliers\n'));
    console.log('Custom mode:');
    console.log(colors.yellow('  npm run sim custom <trader> [days] [multiplier]\n'));
    console.log('Examples:');
    console.log(colors.gray('  npm run sim custom 0x7c3d... 30 2.0'));
    console.log(colors.gray('  npm run sim standard\n'));
}
main().catch((error) => {
    console.error(colors.red('Fatal error:'), error);
    process.exit(1);
});
