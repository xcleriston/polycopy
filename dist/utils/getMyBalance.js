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
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const env_1 = require("../config/env");
const RPC_URL = env_1.ENV.RPC_URL;
const USDC_CONTRACT_ADDRESS = env_1.ENV.USDC_CONTRACT_ADDRESS;
const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];
const getMyBalance = (address) => __awaiter(void 0, void 0, void 0, function* () {
    const rpcProvider = new ethers_1.ethers.providers.JsonRpcProvider(RPC_URL);
    const usdcContract = new ethers_1.ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, rpcProvider);
    const balance_usdc = yield usdcContract.balanceOf(address);
    const balance_usdc_real = ethers_1.ethers.utils.formatUnits(balance_usdc, 6);
    return parseFloat(balance_usdc_real);
});
exports.default = getMyBalance;
