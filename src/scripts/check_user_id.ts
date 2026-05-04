import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const u = await User.findById('69dfe485f83e34811ecef999').lean();
    console.log(JSON.stringify(u, null, 2));
    await mongoose.connection.close();
}
check();
