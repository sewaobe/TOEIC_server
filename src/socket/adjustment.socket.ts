import { Server, Socket } from "socket.io";
import { SocketWithUser } from "./types";

export function registerAdjustmentHandlers(
  io: Server,
  socket: SocketWithUser,
  onlineUsers: Map<string, string>
) {
  // Lắng nghe sự kiện từ client (nếu cần)
  // Ví dụ: socket.on("ADJUSTMENT_READ", (requestId) => { ... });
}

// Helper để gửi thông báo từ Service
export function notifyAdjustment(
  io: Server,
  onlineUsers: Map<string, string>,
  userId: string,
  event: string,
  payload: any
) {
  const socketId = onlineUsers.get(userId.toString());
  if (socketId) {
    io.to(socketId).emit(event, payload);
    console.log(`Sent ${event} to user ${userId}`);
  } else {
    console.log(
      `User ${userId} is offline, notification skipped (or save to DB)`
    );
  }
}
