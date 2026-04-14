import mongoose, { Schema } from 'mongoose';
const UserSchema = new Schema({
    chatId: { type: String, unique: true, index: true, sparse: true },
    email: { type: String, unique: true, index: true, sparse: true },
    username: { type: String, unique: true, index: true, sparse: true },
    password: { type: String },
    role: { type: String, enum: ['admin', 'follower'], default: 'follower' },
    pushSubscription: { type: String },
    wallet: {
        address: { type: String, index: true },
        privateKey: { type: String },
    },
    config: {
        traderAddress: { type: String, index: true },
        strategy: { type: String, default: 'PERCENTAGE' },
        copySize: { type: Number, default: 10.0 },
        enabled: { type: Boolean, default: true },
        reverseCopy: { type: Boolean, default: false },
        orderType: { type: String, enum: ['MARKET', 'LIMIT'], default: 'MARKET' },
        slippage: { type: Number, default: 0.05 },
        tpPercent: { type: Number, default: 0 },
        slPercent: { type: Number, default: 0 },
        minPrice: { type: Number, default: 0 },
        maxPrice: { type: Number, default: 1.0 },
        minTradeSize: { type: Number, default: 1.0 },
        maxTradeSize: { type: Number, default: 1000.0 },
        copyBuy: { type: Boolean, default: true },
        copySell: { type: Boolean, default: true },
        maxExposure: { type: Number, default: 500.0 },
    },
    step: { type: String, default: 'start' },
    refCode: { type: String },
}, { timestamps: true });
export default mongoose.model('User', UserSchema);
