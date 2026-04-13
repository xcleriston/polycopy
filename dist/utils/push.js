var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import webpush from 'web-push';
import User from '../models/user.js';
import Logger from './logger.js';
// VAPID keys should be generated once and stored in .env
// Use: npx web-push generate-vapid-keys
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@polyhacker.tech';
if (PUBLIC_KEY && PRIVATE_KEY) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
}
export const sendPushNotification = (userId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield User.findById(userId);
        if (!user || !user.pushSubscription)
            return;
        const subscription = JSON.parse(user.pushSubscription);
        yield webpush.sendNotification(subscription, JSON.stringify(payload));
        Logger.info(`[Push] Notification sent to user \${user.username || userId}`);
    }
    catch (error) {
        Logger.error(`[Push] Failed to send notification: \${error}`);
        // If 410 (Gone), the subscription is no longer valid
        if (error.statusCode === 410) {
            yield User.updateOne({ _id: userId }, { $unset: { pushSubscription: 1 } });
        }
    }
});
export const broadcastTrade = (traderAddress, tradeData) => __awaiter(void 0, void 0, void 0, function* () {
    const followers = yield User.find({
        'config.traderAddress': traderAddress,
        pushSubscription: { $exists: true }
    });
    for (const follower of followers) {
        yield sendPushNotification(follower._id.toString(), {
            title: 'Poly Hacker Alert ⚡',
            body: `Trade detected: \${tradeData.side} \${tradeData.usdcSize} USDC on \${tradeData.slug}`,
            icon: '/icon.png',
            data: { url: '/' }
        });
    }
});
