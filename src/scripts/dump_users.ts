import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function dumpUsers() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("No MONGODB_URI");
        return;
    }

    await mongoose.connect(uri);
    const users = await User.find({}).lean();
    console.log(JSON.stringify(users, (key, value) => key === 'password' || key === 'privateKey' || key === 'secret' ? '***' : value, 2));
    await mongoose.connection.close();
}

dumpUsers();
