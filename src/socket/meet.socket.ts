import { Server } from 'socket.io';
import { SocketWithUser } from './types';

interface Participant {
    userId: string;
    socketId: string;
}

const meetRooms = new Map<string, Participant[]>(); // roomId → participants

export function registerMeetHandlers(
    io: Server,
    socket: SocketWithUser
) {
    const userId = socket.user?.id;
    if (!userId) return;

    socket.on("meet:join", ({ roomId }: { roomId: string }) => {
        socket.join(roomId);

        const participants = meetRooms.get(roomId) || [];
        participants.push({
            userId,
            socketId: socket.id
        });
        meetRooms.set(roomId, participants);

        socket.to(roomId).emit("meet:user-joined", {
            userId
        });

        console.log(`[Meet] User ${userId} joined room ${roomId}`);
    });

    socket.on("meet:leave", ({ roomId }: { roomId: string }) => {
        socket.leave(roomId);

        const participants = meetRooms.get(roomId) || [];
        const updatedParticipants = participants.filter(
            (p) => p.socketId !== socket.id
        );
        meetRooms.set(roomId, updatedParticipants);

        socket.to(roomId).emit("meet:user-left", {
            userId
        });

        console.log(`[Meet] User ${userId} left room ${roomId}`);
    });

    socket.on("disconnect", () => {
        for (const [roomId, participants] of meetRooms.entries()) {
            const filteredParticipants = participants.filter(
                (p) => p.socketId !== socket.id
            );
            if (filteredParticipants.length !== participants.length) {
                meetRooms.set(roomId, filteredParticipants);
                socket.to(roomId).emit("meet:user-left", {
                    userId
                });
                console.log(`[Meet] User ${userId} disconnected and left room ${roomId}`);
            }
        }
    });
}