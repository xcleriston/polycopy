import mongoose, { Schema } from 'mongoose';
const UserSchema = new Schema({
    chatId: { type: String, required: true, unique: true, index: true },
    wallet: {
        address: { type: String, index: true },
        privateKey: { type: String },
    },
    config: {
        traderAddress: { type: String, index: true },
        strategy: { type: String, default: 'PERCENTAGE' },
        copySize: { type: Number, default: 10.0 },
        enabled: { type: Boolean, default: true },
    },
    step: { type: String, default: 'start' },
    refCode: { type: String },
}, { timestamps: true });
export default mongoose.model('User', UserSchema);
