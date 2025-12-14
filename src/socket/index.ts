import { Server } from "socket.io";
import * as cookie from "cookie";
import jwt from "jsonwebtoken";
import { SocketWithUser } from "./types";
import { registerNotificationHandlers } from "./notification.socket";
import { registerChatHandlers } from "./chat.socket";
import { registerAdjustmentHandlers } from "./adjustment.socket";
import { registerMeetHandlers } from "./meet.socket";

export const onlineUsers = new Map<string, string>(); // userId → socketId
export let io: Server;

export function initSocket(server: any) {
  io = new Server(server, {
    cors: {
      origin: ["http://localhost:5173", "http://localhost:5174"],
      credentials: true,
    },
  });


  // ===========================
  // Middleware xác thực socket
  // ===========================
  io.use((socket: SocketWithUser, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie || "";
      const cookies = cookie.parse(cookieHeader);
      const token = cookies["accessToken"];
      if (!token) {
        console.warn("Missing accessToken cookie — blocking connection");
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as { _id: string; fullname: string };
      socket.user = { id: decoded._id, fullname: decoded.fullname };

      console.log("Authenticated socket for user:", decoded._id, "-", decoded.fullname);
      return next();
    } catch (err) {
      console.warn("Invalid or expired token — blocking connection");
      return next(new Error("Invalid token"));
    }
  });

  // ===========================
  // 🔌 Khi socket kết nối thành công
  // ===========================
  io.on("connection", (socket: SocketWithUser) => {
    const userId = socket.user?.id;

    if (userId) {
      onlineUsers.set(userId, socket.id);
      console.log(`Auth user connected: ${userId}`);
    } else {
      console.log(`Guest connected: ${socket.id}`);
    }

    // Kích hoạt các module socket
    registerNotificationHandlers(io, socket, onlineUsers);
    registerChatHandlers(socket);
    registerAdjustmentHandlers(io, socket, onlineUsers);
    registerMeetHandlers(io, socket);

    // ===========================
    // 🔌 Khi socket ngắt kết nối
    // ===========================
    socket.on("disconnect", () => {
      if (userId) onlineUsers.delete(userId);
      console.log(`Socket disconnected: ${userId || socket.id}`);
    });
  });

  console.log("Socket.IO initialized");
  return io;
}
