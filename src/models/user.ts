import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    chatId?: string; // Optional for web-only users
    email?: string;
    username?: string;
    password?: string;
    role: 'admin' | 'follower';
    pushSubscription?: string;
    wallet?: {
        address: string;
        privateKey: string;
    };
    config: {
        traderAddress: string;
        strategy: string;
        copySize: number;
        enabled: boolean;
    };
    step: string;
    refCode?: string;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema: Schema = new Schema({
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
    },
    step: { type: String, default: 'start' },
    refCode: { type: String },
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);
