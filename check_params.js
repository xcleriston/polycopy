import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import User from './dist/models/user.js';
dotenv.config();

async function checkLcr() {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ username: 'lcr' });
  console.log('--- LCR CONFIG ---');
  console.log(JSON.stringify(user.config, null, 2));
  process.exit(0);
}

checkLcr();
