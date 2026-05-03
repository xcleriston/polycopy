var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();
function fixCopiador() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose.connect(process.env.MONGODB_URI);
        const eoa = '0xC25C4CECd118E1F90b8D7fb41f19e1E9ef687FF3';
        const proxy = '0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B';
        const result = yield User.findOneAndUpdate({ 'wallet.address': eoa }, { $set: { 'wallet.proxyAddress': proxy } }, { new: true });
        if (result) {
            console.log(`✅ Success! User ${result.username} updated.`);
            console.log(`EOA: ${result.wallet.address}`);
            console.log(`Proxy: ${result.wallet.proxyAddress}`);
        }
        else {
            console.log("❌ User not found with EOA " + eoa);
        }
        yield mongoose.connection.close();
    });
}
fixCopiador();
