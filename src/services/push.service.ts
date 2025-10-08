import Subscription from "../models/subscription.model";
import { webpush } from "../utils/webpush";

export async function addSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
) {
  // idempotent: nếu endpoint tồn tại → return
  const exist = await Subscription.findOne({ endpoint: subscription.endpoint });
  if (exist) return exist;

  return Subscription.create({
    userId,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    userAgent,
  });
}

export async function removeSubscriptionByEndpoint(endpoint: string) {
  return Subscription.deleteOne({ endpoint });
}

export async function listUserSubscriptions(userId: string) {
  return Subscription.find({ userId }).lean();
}

export async function sendWebPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; icon?: string }
) {
  const subs = await Subscription.find({ userId });
  if (!subs.length) return { delivered: 0, total: 0 };

  const message = JSON.stringify(payload);
  let delivered = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub as any, message);
      delivered += 1;
    } catch (err: any) {
      // 410/404: endpoint invalid → xoá subscription
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        // eslint-disable-next-line no-console
        console.warn("Removing invalid subscription", sub._id, err?.statusCode);
        await Subscription.deleteOne({ _id: sub._id });
      } else {
        // eslint-disable-next-line no-console
        console.error("WebPush error:", err?.statusCode || err?.message);
      }
    }
  }
  return { delivered, total: subs.length };
}
