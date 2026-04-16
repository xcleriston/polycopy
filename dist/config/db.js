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
import chalk from 'chalk';
import { ENV } from './env.js';
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    // If MONGODB_URI is not provided, we might want to fall back to NeDB or just fail
    // For multiple instances, we MUST have MONGODB_URI
    const uri = ENV.MONGODB_URI;
    if (!uri) {
        console.log(chalk.yellow('!'), 'MONGODB_URI not found in environment.');
        console.log(chalk.red('✗'), 'MongoDB connection failed: MONGODB_URI is required for multi-instance support.');
        process.exit(1);
    }
    // Improve stability by disabling buffering and auto-indexing
    mongoose.set('bufferCommands', false);
    mongoose.set('autoIndex', false);
    try {
        const options = {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4, // Use IPv4 for stability
            retryWrites: false,
            retryReads: false
        };
        yield mongoose.connect(uri, options);
        console.log(chalk.green('✓'), 'MongoDB connected successfully');
    }
    catch (error) {
        console.log(chalk.red('✗'), 'MongoDB connection failed:', error);
        process.exit(1);
    }
});
export const closeDB = () => __awaiter(void 0, void 0, void 0, function* () {
    yield mongoose.connection.close();
    console.log(chalk.green('✓'), 'Database connection closed');
});
export default connectDB;
