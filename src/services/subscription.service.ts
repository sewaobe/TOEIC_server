import Subscription from "../models/subscription.model";

export async function addSubscription(userId: string, subscription: any, userAgent?: string) {
  const exist = await Subscription.findOne({ endpoint: subscription.endpoint });
  if (exist) return exist;

  const newSub = await Subscription.create({
    userId,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    userAgent,
  });
  return newSub;
}

export async function removeSubscription(endpoint: string) {
  return Subscription.deleteOne({ endpoint });
}

export async function listUserSubscriptions(userId: string) {
  return Subscription.find({ userId });
}
