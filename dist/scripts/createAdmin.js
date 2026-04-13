var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import connectDB from '../config/db.js';
import User from '../models/user.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();
const createAdmin = () => __awaiter(void 0, void 0, void 0, function* () {
    yield connectDB();
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'hacker123';
    const email = process.env.ADMIN_EMAIL || 'admin@polyhacker.tech';
    try {
        const existing = yield User.findOne({ role: 'admin' });
        if (existing) {
            console.log('Admin already exists:', existing.username);
            process.exit(0);
        }
        const hashedPassword = yield bcrypt.hash(password, 10);
        const admin = new User({
            username,
            email,
            password: hashedPassword,
            role: 'admin',
            step: 'ready',
            config: {
                enabled: true,
                strategy: 'PERCENTAGE',
                copySize: 0,
                traderAddress: 'ADMIN'
            }
        });
        yield admin.save();
        console.log(`✅ Admin created successfully!`);
        console.log(`Username: ${username}`);
        console.log(`Password: ${password}`);
        process.exit(0);
    }
    catch (error) {
        console.error('Error creating admin:', error);
        process.exit(1);
    }
});
createAdmin();
