import { io, onlineUsers } from "../socket";
import { createNotification } from "../services/notification.service";
import { sendWebPushToUser } from "../services/push.service";

export interface PushOptions {
  senderId?: string;
  recipientId: string;
  message: string;
  description?: string;
  type?: "system" | "comment" | "error" | "chat" | "test" | "lesson";
  url?: string;
}

export async function pushNotification({
  senderId,
  recipientId,
  message,
  description,
  type = "system",
  url = "",
}: PushOptions) {
  try {
    // Tạo bản ghi notification trong DB
    const notif = await createNotification({ senderId, recipientId, message, type, description });

    // Nếu user online → gửi socket realtime
    const socketId = onlineUsers.get(recipientId.toString());
    if (socketId) {
      io.to(socketId).emit("receiveNotification", notif);
      console.log(`📩 Đã gửi realtime tới user ${recipientId}`);
    }
    if (url) {
      // Dù online hay không → gửi Web Push
      await sendWebPushToUser(recipientId, {
        title: "Thông báo mới",
        body: message,
        url,
      });
    }

    return notif;
  } catch (err) {
    console.error("❌ pushNotification error:", err);
    return null;
  }
}
