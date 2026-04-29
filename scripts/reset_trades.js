
async function listAndReset() {
    // Search for anything in the last 24 hours
    const cutoff = Date.now() - 24 * 3600 * 1000;
    console.log("Checking trades after:", new Date(cutoff).toISOString());
    
    const trades = db.useractivities.find({ timestamp: { $gt: cutoff } }).toArray();
    console.log(`Found ${trades.length} trades.`);
    
    for (const t of trades) {
        console.log(`Trade: ${t.transactionHash} Bot: ${t.bot} Time: ${new Date(t.timestamp).toISOString()}`);
        db.useractivities.updateOne(
            { _id: t._id },
            { $set: { bot: false, processedBy: [] } }
        );
    }
    console.log("Done.");
}

listAndReset();
