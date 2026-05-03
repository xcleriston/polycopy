import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkEmails() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const users = await User.find({}).lean();
    console.log(`Found ${users.length} users.`);
    users.forEach(u => {
        console.log(`User: ${(u as any).username} | Email: ${(u as any).email} | Addr: ${(u as any).wallet?.address}`);
    });
    await mongoose.connection.close();
}
checkEmails();
