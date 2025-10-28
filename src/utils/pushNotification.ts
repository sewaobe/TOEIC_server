import { io, onlineUsers } from "../socket";
import { createNotification } from "../services/notification.service";
import { sendWebPushToUser } from "../services/push.service";

interface PushOptions {
  senderId?: string;
  recipientId: string;
  message: string;
  type?: "system" | "comment" | "error" | "chat" | "test";
  url?: string;
}

export async function pushNotification({
  senderId,
  recipientId,
  message,
  type = "system",
  url = "",
}: PushOptions) {
  try {
    // 1️⃣ Tạo bản ghi notification trong DB
    const notif = await createNotification({ senderId, recipientId, message, type });

    // 2️⃣ Nếu user online → gửi socket realtime
    const socketId = onlineUsers.get(recipientId.toString());
    if (socketId) {
      io.to(socketId).emit("receiveNotification", notif);
      console.log(`📩 Đã gửi realtime tới user ${recipientId}`);
    }

    // 3️⃣ Dù online hay không → gửi Web Push
    await sendWebPushToUser(recipientId, {
      title: "Thông báo mới",
      body: message,
      url,
    });

    return notif;
  } catch (err) {
    console.error("❌ pushNotification error:", err);
    return null;
  }
}
