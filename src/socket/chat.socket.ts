import { SocketWithUser } from "./types";
import { processUserMessageService } from "../services/chat.service";
import { ChatMessage } from "../models/chat_message.model";

interface ChatMessagePayload {
    sessionId: string;
    userText: string;
    questionId?: string;
}

export function registerChatHandlers(socket: SocketWithUser) {
    const userId = socket.user?.id;
    if (!userId) {
        console.warn("⛔ Socket không có userId, bỏ qua chat handlers");
        return;
    }

    console.log(`💬 Chat handlers registered for user ${userId}`);

    socket.on("chat:send", async (data: ChatMessagePayload) => {
        try {
            const { sessionId, userText, questionId } = data;
            if (!sessionId || !userText) {
                return socket.emit("chat:error", {
                    type: "VALIDATION_ERROR",
                    message: "Thiếu sessionId hoặc userText",
                });
            }

            // Tạo trước userMessage trong DB (hoặc mock)
            const userMessage = await ChatMessage.create({
                session_id: sessionId,
                sender: "user",
                text: userText,
                created_at: new Date(),
            });

            // Emit ngay cho FE hiển thị (KHÔNG cần chờ LLM)
            socket.emit("chat:receive", {
                sender: "user",
                message: userMessage,
            });

            // Emit botTyping cho cảm giác “bot đang nghĩ”
            socket.emit("chat:botTyping", { sessionId });

            // 4Gọi model thật (Gemini / RAG / retriever)
            const { botMessage } = await processUserMessageService(
                sessionId,
                userText,
                questionId
            );

            // Khi có kết quả → gửi tin bot
            socket.emit("chat:receive", {
                sender: "bot",
                message: botMessage,
            });

            // Dừng hiệu ứng typing
            socket.emit("chat:botStopTyping", { sessionId }); 

            // Cập nhật session preview
            socket.emit("chat:sessionUpdated", {
                sessionId,
                last_message_preview: botMessage.text.slice(0, 100),
                updated_at: new Date(),
            });

        } catch (err) {
            console.error("❌ Lỗi khi xử lý tin nhắn chat:", err);
            socket.emit("chat:error", {
                type: "PROCESS_ERROR",
                message: "Lỗi khi xử lý tin nhắn chat",
            });
        }
    });

    socket.on("chat:history:load", async (sessionId: string) => {
        try {
            const messages = await ChatMessage.find({ session_id: sessionId }).sort({
                created_at: 1,
            });
            socket.emit("chat:history:loaded", messages);
        } catch (err) {
            console.error("❌ Lỗi load lịch sử chat:", err);
            socket.emit("chat:error", {
                type: "LOAD_ERROR",
                message: "Không thể tải lịch sử chat",
            });
        }
    });
}
