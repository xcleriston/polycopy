import mongoose from 'mongoose';
import { ENV } from './src/config/env.js';
import User from './src/models/user.js';
import { Activity } from './src/models/userHistory.js';

async function recover() {
    await mongoose.connect(ENV.MONGO_URI);
    console.log('Connected to DB');

    // Find unique chatIds in Activity that are NOT in User
    const usersInActivity = await Activity.distinct('chatId');
    const existingUsers = await User.distinct('chatId');
    const missingUsers = usersInActivity.filter(u => !existingUsers.includes(u));
    
    console.log('Missing Users according to Activity:', missingUsers);

    for (const chatId of missingUsers) {
        const lastActivity = await Activity.findOne({ chatId }).sort({ timestamp: -1 });
        if (lastActivity) {
            console.log(`Data for ${chatId}:`, {
                trader: lastActivity.traderAddress,
                title: lastActivity.title,
                // We can't recover everything but this helps
            });
        }
    }

    // Special case for lcr@gmail.com
    const lcrActivity = await Activity.findOne({ $or: [{ chatId: 'lcr' }, { traderAddress: /0xb27bc932/i }] }).sort({ timestamp: -1 });
    if (lcrActivity) {
        console.log('LCR Full Info:', lcrActivity);
    }

    await mongoose.disconnect();
}

recover().catch(console.error);
