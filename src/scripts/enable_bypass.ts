import mongoose from 'mongoose';
import User from '../models/user.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function update() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const res = await User.updateOne(
        { username: 'copiador' },
        { $set: { 'config.bypassFilters': true } }
    );
    console.log("Update result:", res);
    await mongoose.connection.close();
}
update();
