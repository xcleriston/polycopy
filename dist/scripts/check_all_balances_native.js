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
import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();
const USDC_ABI = ["function balanceOf(address account) view returns (uint256)"];
const USDC_NATIVE_ADDR = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/VDsFz_Ooaj0-4vaVrIxOd';
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        yield mongoose.connect(process.env.MONGODB_URI);
        const provider = new ethers.providers.JsonRpcProvider(RPC);
        const usdc = new ethers.Contract(USDC_NATIVE_ADDR, USDC_ABI, provider);
        const users = yield User.find({}).lean();
        for (const u of users) {
            const eoa = (_a = u.wallet) === null || _a === void 0 ? void 0 : _a.address;
            const proxy = (_b = u.wallet) === null || _b === void 0 ? void 0 : _b.proxyAddress;
            if (eoa) {
                const b = yield usdc.balanceOf(eoa);
                console.log(`User ${u.username} EOA ${eoa} (Native): ${ethers.utils.formatUnits(b, 6)}`);
            }
            if (proxy && proxy !== eoa) {
                const b = yield usdc.balanceOf(proxy);
                console.log(`User ${u.username} PROXY ${proxy} (Native): ${ethers.utils.formatUnits(b, 6)}`);
            }
        }
        yield mongoose.connection.close();
    });
}
check();
