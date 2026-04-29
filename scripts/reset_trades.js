
async function debugDB() {
    console.log("Collections:", db.getCollectionNames());
    const count = db.useractivities.countDocuments();
    console.log("Count in useractivities:", count);
    if (count > 0) {
        const last = db.useractivities.find().sort({timestamp: -1}).limit(1).toArray()[0];
        console.log("Last trade timestamp:", last.timestamp, "Type:", typeof last.timestamp);
    }
}
debugDB();
