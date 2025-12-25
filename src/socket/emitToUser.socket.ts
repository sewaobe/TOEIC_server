import { io, onlineUsers } from ".";

export function emitToUser(userId: string, event: string, payload: any) {
    const socketId = onlineUsers.get(userId);
    if (!socketId) return false; // user offline
    io.to(socketId).emit(event, payload);
    return true;
}
