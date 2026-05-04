import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const u = await User.find({}).lean();
    console.log(JSON.stringify(u.map(x => ({ username: x.username, eoa: (x as any).wallet?.address, proxy: (x as any).wallet?.proxyAddress })), null, 2));
    await mongoose.connection.close();
}
check();
