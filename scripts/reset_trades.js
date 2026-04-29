
async function resetLastTrades() {
    const cutoff = 1777490000000;
    console.log("Checking trades after:", new Date(cutoff).toISOString());
    
    const trades = db.useractivities.find({ timestamp: { $gt: cutoff } }).toArray();
    console.log(`Found ${trades.length} trades.`);
    
    for (const t of trades) {
        console.log(`Resetting trade: ${t.transactionHash}`);
        db.useractivities.updateOne(
            { _id: t._id },
            { $set: { bot: false, processedBy: [] } }
        );
    }
    console.log("Done.");
}

resetLastTrades();
