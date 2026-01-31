import { Request, Response } from "express";
import { addSubscription, listUserSubscriptions, removeSubscriptionByEndpoint } from "../services/push.service";
import { ApiResponse } from "../utils/ApiResponse";

export async function registerSubscription(req: Request, res: Response) {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

    const userId = req.user._id;
    const subscription = req.body.subscription;
    const userAgent = req.get("user-agent") || req.body.userAgent;

    if (!userId || !subscription?.endpoint || !subscription?.keys) {
      return res.status(400).json(ApiResponse.fail("Invalid payload"));
    }

    const sub = await addSubscription(userId, subscription, userAgent);
    return res.status(201).json({ success: true, data: sub });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("registerSubscription error:", err);
    return res.status(500).json({ success: false });
  }
}

export async function getMySubscriptions(req: Request, res: Response) {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

    const userId = req.user._id;
    if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });

    const subs = await listUserSubscriptions(userId);
    return res.json({ success: true, data: subs });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("getMySubscriptions error:", err);
    return res.status(500).json({ success: false });
  }
}

export async function unregisterSubscription(req: Request, res: Response) {
  try {
    const endpoint = req.body.endpoint || (req.query.endpoint as string);
    if (!endpoint) return res.status(400).json({ success: false, message: "Missing endpoint" });

    await removeSubscriptionByEndpoint(endpoint);
    return res.json({ success: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("unregisterSubscription error:", err);
    return res.status(500).json({ success: false });
  }
}
