import connectDB from '../dist/config/db.js';
import User from '../dist/models/user.js';

async function run() {
    try {
        await connectDB();
        const res = await User.updateOne(
            { username: 'copiador' }, 
            { 
                $set: { 
                    'config.mode': 'ARBITRAGE', 
                    'config.enabled': true, 
                    'config.copySize': 1.2, 
                    'config.triggerDelta': 0.002, 
                    'config.hedgeCeiling': 0.99 
                } 
            }
        );
        console.log('UPDATE_RESULT:' + JSON.stringify(res));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
