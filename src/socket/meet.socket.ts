import { Server } from "socket.io";
import { SocketWithUser } from "./types";

/* =========================
   TYPES
========================= */
type RTCSdpType = "offer" | "answer";

interface WebRTCSessionDescription {
    type: RTCSdpType;
    sdp: string;
}

interface WebRTCIceCandidate {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
}

interface Participant {
    userId: string;      // internal user id
    fullname: string;    // display name
    socketId: string;
    micOn?: boolean;
    camOn?: boolean;
}

const meetRooms = new Map<string, Participant[]>();

export function registerMeetHandlers(io: Server, socket: SocketWithUser) {
    const userId = socket.user?.id;
    const fullname = socket.user?.fullname;
    if (!userId || !fullname) return;

    /* ===== JOIN ROOM ===== */
    socket.on("meet:join", ({ roomId }: { roomId: string }) => {
        socket.join(roomId);

        const participants = meetRooms.get(roomId) || [];

        const participant: Participant = {
            userId,
            fullname: fullname,
            socketId: socket.id,
            micOn: false,
            camOn: false
        };

        participants.push(participant);
        meetRooms.set(roomId, participants);

        // 🔥 gửi toàn bộ danh sách (bao gồm cả chính nó)
        socket.emit("meet:participants", participants);

        socket.to(roomId).emit("meet:new-user", {
            userId,
            fullname: fullname || userId,
            socketId: socket.id
        });

        console.log(`[Meet] ${fullname || userId} joined room ${roomId}`);
    });

    /* ===== LEAVE ROOM ===== */
    socket.on("meet:leave", ({ roomId }: { roomId: string }) => {
        socket.leave(roomId);

        const participants = meetRooms.get(roomId) || [];
        meetRooms.set(
            roomId,
            participants.filter(p => p.socketId !== socket.id)
        );

        socket.to(roomId).emit("meet:user-left", {
            socketId: socket.id
        });

        console.log(`[Meet] ${fullname || userId} left room ${roomId}`);
    });

    /* =========================
       WEBRTC SIGNALING (1–1)
    ========================= */

    /* ===== MEDIA STATE BROADCAST (MIC/CAM) ===== */
    socket.on(
        "meet:media-update",
        ({ roomId, micOn, camOn }: { roomId: string; micOn: boolean; camOn: boolean }) => {
            // Update stored media state for this participant in the room
            const roomParticipants = meetRooms.get(roomId);
            if (roomParticipants) {
                meetRooms.set(
                    roomId,
                    roomParticipants.map(p =>
                        p.socketId === socket.id
                            ? { ...p, micOn, camOn }
                            : p
                    )
                );
            }

            // Broadcast only to other participants in the room
            socket.to(roomId).emit("meet:media-update", {
                socketId: socket.id,
                micOn,
                camOn
            });
        }
    );

    /* ----- OFFER ----- */
    socket.on(
        "webrtc:offer",
        ({ to, offer }: { to: string; offer: WebRTCSessionDescription }) => {
            io.to(to).emit("webrtc:offer", {
                from: socket.id,
                offer
            });

            console.log(`[WebRTC] Offer ${socket.id} → ${to}`);
        }
    );

    /* ----- ANSWER ----- */
    socket.on(
        "webrtc:answer",
        ({ to, answer }: { to: string; answer: WebRTCSessionDescription }) => {
            io.to(to).emit("webrtc:answer", {
                from: socket.id,
                answer
            });

            console.log(`[WebRTC] Answer ${socket.id} → ${to}`);
        }
    );

    /* ----- ICE ----- */
    socket.on(
        "webrtc:ice",
        ({ to, candidate }: { to: string; candidate: WebRTCIceCandidate }) => {
            io.to(to).emit("webrtc:ice", {
                from: socket.id,
                candidate
            });
        }
    );

    /* ===== DISCONNECT ===== */
    socket.on("disconnect", () => {
        for (const [roomId, participants] of meetRooms.entries()) {
            const remaining = participants.filter(
                p => p.socketId !== socket.id
            );

            if (remaining.length !== participants.length) {
                meetRooms.set(roomId, remaining);

                socket.to(roomId).emit("meet:user-left", {
                    socketId: socket.id
                });

                console.log(
                    `[Meet] ${fullname || userId} disconnected from room ${roomId}`
                );
            }
        }
    });
}
