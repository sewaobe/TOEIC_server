import { Server } from "socket.io";
import { SocketWithUser } from "./types";

interface NotificationData {
  recipientId: string;
  message: string;
  type?: "system" | "comment" | "error" | "chat" | "test";
}

export function registerNotificationHandlers(
  io: Server,
  socket: SocketWithUser,
  onlineUsers: Map<string, string>
) {
  setTimeout(() => {
    socket.emit("receiveNotification", {
      type: "system",
      message: `👋 Chào mừng bạn ${socket.user?.id || "Guest"} đến với Dashboard!`,
      createdAt: new Date(),
    })
  }, 2000)
  // Gửi thông báo tới user khác
  socket.on("sendNotification", (data: NotificationData) => {
    const { recipientId, message, type } = data;
    const recipientSocketId = onlineUsers.get(recipientId);

    if (recipientSocketId) {
      io.to(recipientSocketId).emit("receiveNotification", {
        senderId: socket.user?.id,
        message,
        type: type || "system",
        createdAt: new Date(),
      });
      console.log(`📩 Notification sent from ${socket.user?.id} to ${recipientId}`);
    } else {
      console.log(`⚠️ User ${recipientId} is offline`);
      // sau này có thể lưu DB
    }
  });

  socket.on("markNotificationRead", (notifId) => {
    console.log(`📖 ${socket.user?.id} marked ${notifId} as read`);
  });
}
