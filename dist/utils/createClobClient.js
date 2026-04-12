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
const ethers_1 = require("ethers");
const clob_client_1 = require("@polymarket/clob-client");
const order_utils_1 = require("@polymarket/order-utils");
const env_1 = require("../config/env");
const logger_1 = __importDefault(require("./logger"));
const PROXY_WALLET = env_1.ENV.PROXY_WALLET;
const PRIVATE_KEY = env_1.ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = env_1.ENV.CLOB_HTTP_URL;
const RPC_URL = env_1.ENV.RPC_URL;
/**
 * Determines if a wallet is a Gnosis Safe by checking if it has contract code
 */
const isGnosisSafe = (address) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Using ethers v5 syntax
        const provider = new ethers_1.ethers.providers.JsonRpcProvider(RPC_URL);
        const code = yield provider.getCode(address);
        // If code is not "0x", then it's a contract (likely Gnosis Safe)
        return code !== '0x';
    }
    catch (error) {
        logger_1.default.error(`Error checking wallet type: ${error}`);
        return false;
    }
});
const createClobClient = () => __awaiter(void 0, void 0, void 0, function* () {
    const chainId = 137;
    const host = CLOB_HTTP_URL;
    const wallet = new ethers_1.ethers.Wallet(PRIVATE_KEY);
    // Detect if the proxy wallet is a Gnosis Safe or EOA
    const isProxySafe = yield isGnosisSafe(PROXY_WALLET);
    const signatureType = isProxySafe ? order_utils_1.SignatureType.POLY_GNOSIS_SAFE : order_utils_1.SignatureType.EOA;
    logger_1.default.info(`Wallet type detected: ${isProxySafe ? 'Gnosis Safe' : 'EOA (Externally Owned Account)'}`);
    let clobClient = new clob_client_1.ClobClient(host, chainId, wallet, undefined, signatureType, isProxySafe ? PROXY_WALLET : undefined);
    // Suppress console output during API key creation
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = function () { };
    console.error = function () { };
    let creds = yield clobClient.createApiKey();
    if (!creds.key) {
        creds = yield clobClient.deriveApiKey();
    }
    clobClient = new clob_client_1.ClobClient(host, chainId, wallet, creds, signatureType, isProxySafe ? PROXY_WALLET : undefined);
    // Restore console functions
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    return clobClient;
});
exports.default = createClobClient;
