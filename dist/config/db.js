var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
const DB_DIR = path.join(process.cwd(), 'data');
const ensureDbDir = () => {
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }
};
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        ensureDbDir();
        console.log(chalk.green('✓'), `NeDB initialized (${DB_DIR})`);
    }
    catch (error) {
        console.log(chalk.red('✗'), 'NeDB initialization failed:', error);
        process.exit(1);
    }
});
export const closeDB = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log(chalk.green('✓'), 'Database closed');
});
export const getDbDir = () => DB_DIR;
export default connectDB;
