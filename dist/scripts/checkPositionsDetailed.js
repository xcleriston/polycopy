"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../config/env");
const fetchData_1 = __importDefault(require("../utils/fetchData"));
const PROXY_WALLET = env_1.ENV.PROXY_WALLET;
function checkPositions() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\n📊 CURRENT POSITIONS:\n');
        const positions = yield (0, fetchData_1.default)(`https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`);
        if (!positions || positions.length === 0) {
            console.log('❌ No open positions');
            return;
        }
        console.log(`✅ Found positions: ${positions.length}\n`);
        // Sort by current value
        const sorted = positions.sort((a, b) => b.currentValue - a.currentValue);
        let totalValue = 0;
        for (const pos of sorted) {
            totalValue += pos.currentValue;
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`Market: ${pos.title || 'Unknown'}`);
            console.log(`Outcome: ${pos.outcome || 'Unknown'}`);
            console.log(`Asset ID: ${pos.asset.slice(0, 10)}...`);
            console.log(`Size: ${pos.size.toFixed(2)} shares`);
            console.log(`Avg Price: $${pos.avgPrice.toFixed(4)}`);
            console.log(`Current Price: $${pos.curPrice.toFixed(4)}`);
            console.log(`Initial Value: $${pos.initialValue.toFixed(2)}`);
            console.log(`Current Value: $${pos.currentValue.toFixed(2)}`);
            console.log(`PnL: $${pos.cashPnl.toFixed(2)} (${pos.percentPnl.toFixed(2)}%)`);
            if (pos.slug)
                console.log(`URL: https://polymarket.com/event/${pos.slug}`);
        }
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`💰 TOTAL CURRENT VALUE: $${totalValue.toFixed(2)}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        // Identify large positions (greater than $5)
        const largePositions = sorted.filter((p) => p.currentValue > 5);
        if (largePositions.length > 0) {
            console.log(`\n🎯 LARGE POSITIONS (> $5): ${largePositions.length}\n`);
            for (const pos of largePositions) {
                console.log(`• ${pos.title || 'Unknown'} [${pos.outcome}]: $${pos.currentValue.toFixed(2)} (${pos.size.toFixed(2)} shares @ $${pos.curPrice.toFixed(4)})`);
            }
            console.log(`\n💡 To sell 80% of these positions, use:\n`);
            console.log(`   npm run manual-sell\n`);
            console.log(`📋 Data for selling:\n`);
            for (const pos of largePositions) {
                const sellSize = Math.floor(pos.size * 0.8);
                console.log(`   Asset ID: ${pos.asset}`);
                console.log(`   Size to sell: ${sellSize} (80% of ${pos.size.toFixed(2)})`);
                console.log(`   Market: ${pos.title} [${pos.outcome}]`);
                console.log(``);
            }
        }
        else {
            console.log('\n✅ No large positions (> $5)');
        }
    });
}
checkPositions().catch(console.error);
