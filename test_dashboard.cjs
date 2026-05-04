
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env from the root
dotenv.config({ path: path.join(__dirname, './.env') });

const UserActivitySchema = new mongoose.Schema({}, { strict: false });
const Activity = mongoose.model('UserActivity', UserActivitySchema);

async function run() {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI not found in .env');
        process.exit(1);
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find the latest trade to update it as a test
    const latestTrade = await Activity.findOne({ type: 'TRADE' }).sort({ timestamp: -1 });

    if (!latestTrade) {
        console.log('No trades found to update');
        process.exit(0);
    }

    console.log('Updating trade:', latestTrade._id);

    const followerId = '65dfe485f83e34811ecef999'; // Example ID

    const dashboardData = {
        status: 'SUCESSO',
        details: 'Teste de sincronização de colunas (War Mode)',
        timestamp: new Date(),
        // Price fields
        price: 0.63,
        myEntryPrice: 0.63,
        entryPrice: 0.63,
        executedPrice: 0.63,
        // Amount fields
        amount: 1.01,
        myEntryAmount: 1.01,
        value: 1.01,
        // Profit fields
        pnl: 0.59,
        profit: 0.59,
        percentPnl: 58.7,
        processedBy: [followerId],
        processed: true
    };

    await Activity.updateOne(
        { _id: latestTrade._id },
        { 
            $set: { [`followerStatuses.${followerId}`]: dashboardData },
            $addToSet: { processedBy: followerId }
        }
    );

    console.log('✅ Trade updated with full metadata for dashboard testing');
    await mongoose.disconnect();
}

run().catch(console.error);
