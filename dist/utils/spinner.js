"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ora_1 = __importDefault(require("ora"));
const spinner = (0, ora_1.default)({
    spinner: {
        interval: 200,
        frames: [
            '▰▱▱▱▱▱▱',
            '▰▰▱▱▱▱▱',
            '▰▰▰▱▱▱▱',
            '▰▰▰▰▱▱▱',
            '▰▰▰▰▰▱▱',
            '▰▰▰▰▰▰▱',
            '▰▰▰▰▰▰▰',
            '▱▱▱▱▱▱▱',
        ],
    },
});
exports.default = spinner;
