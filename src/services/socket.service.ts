import { io, onlineUsers } from "../socket";
import { notifyAdjustment } from "../socket/adjustment.socket";

export const socketService = {
  notifyStudent: (studentId: string, event: string, data: any) => {
    if (io) {
      notifyAdjustment(io, onlineUsers, studentId, event, data);
    }
  },
  notifyCollaborator: (collaboratorId: string, event: string, data: any) => {
    if (io) {
      notifyAdjustment(io, onlineUsers, collaboratorId, event, data);
    }
  },
};
