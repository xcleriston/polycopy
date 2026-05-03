import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function dump() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const u = await User.findOne({ username: 'copiador' }).lean();
    console.log(JSON.stringify(u, null, 2));
    await mongoose.connection.close();
}
dump();
