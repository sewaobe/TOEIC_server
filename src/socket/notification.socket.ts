import { Server } from "socket.io";
import { SocketWithUser } from "./types";
import { createNotification, createWelcomeNotificationOnce, markNotificationAsRead } from "../services/notification.service";

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
  //Gửi lời chào khi kết nối
  const userId = socket.user?.id;

  if (userId) {
    setTimeout(async () => {
      try {
        const welcomeNotif = await createWelcomeNotificationOnce(userId);
        if (welcomeNotif) {
          socket.emit("receiveNotification", welcomeNotif);
          console.log(`🎉 Gửi thông báo chào mừng đầu tiên cho user ${userId}`);
        } else {
          console.log(`🟢 User ${userId} đã có thông báo chào mừng — bỏ qua`);
        }
      } catch (err) {
        console.error("❌ Lỗi khi tạo thông báo chào mừng:", err);
      }
    }, 2000);
  }

  //Gửi thông báo tới user khác
  socket.on("sendNotification", async (data: NotificationData) => {
    try {
      const notif = await createNotification({
        senderId: socket.user?.id,
        recipientId: data.recipientId,
        message: data.message,
        type: data.type,
      });

      const recipientSocketId = onlineUsers.get(data.recipientId);

      if (recipientSocketId) {
        io.to(recipientSocketId).emit("receiveNotification", notif);
        console.log(`📩 Notification sent from ${socket.user?.id} to ${data.recipientId}`);
      } else {
        console.log(`⚠️ User ${data.recipientId} is offline → chỉ lưu trong DB`);
      }
    } catch (err) {
      console.error("❌ Lỗi khi gửi thông báo:", err);
    }
  });

  //Đánh dấu thông báo đã đọc
  socket.on("markNotificationRead", async (notifId: string) => {
    try {
      const userId = socket.user?.id;
      if (!userId) return;

      const updatedNotif = await markNotificationAsRead(notifId, userId);
      if (!updatedNotif) {
        console.log(`⚠️ Không tìm thấy thông báo ${notifId} để cập nhật`);
        return;
      }

      console.log(`📖 User ${userId} đã đọc thông báo ${notifId}`);

      // Optional: gửi lại cho client xác nhận cập nhật thành công
      socket.emit("notificationMarkedRead", {
        _id: updatedNotif._id,
        isRead: updatedNotif.isRead,
      });
    } catch (err) {
      console.error("❌ Lỗi khi đánh dấu đã đọc:", err);
    }
  });
}
