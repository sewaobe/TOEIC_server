import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import { ChatType, ChatSession } from "../models/chat_session.model";
import { createChatSessionService, createChatMessageService } from "../services/chat.service";
import { ChatMessage } from "../models/chat_message.model";
import axios from "axios";
import { convertWebmBase64ToWavBase64 } from "../utils/audioConvert";

// Types aligned with TOEIC_client/src/types/PracticeSpeaking.ts
interface UserConfig {
    scenario: string;
    level: string;
    userRole: string;
    botTone: string;
    goal: string;
    durationMinutes: number;
    botSpeed: "slow" | "normal" | "fast";
}

interface Mistake {
    original: string;
    correction: string;
    type: "grammar" | "vocabulary" | "pronunciation";
    explanation: string;
}

interface Feedback {
    pronunciationScore: number;
    fluencyScore: number;
    intonationScore: number;
    grammarScore: number;
    mistakes: Mistake[];
    improvementTip: string;
    totalScore: number;
}

interface TurnResponse {
    feedback: Feedback;
    botText: string;
    botTranslation: string;
    userTranscript: string;
    userTranslation?: string;
    isUnintelligible: boolean;
    botAudioBase64?: string;
}

// 1. Create speaking conversation session
export const createSpeakingSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const { title, config } = req.body as { title: string; config: UserConfig };

        if (!title || !config) {
            return res.status(400).json(
                ApiResponse.fail("Thiếu tham số `title` hoặc `config`.")
            );
        }

        const type: ChatType = "speaking_conversation";

        const newSession = await createChatSessionService(userId, title, type, config);

        return res.status(201).json(
            ApiResponse.success(newSession, "Tạo phiên luyện nói mới thành công")
        );
    } catch (err) {
        next(err);
    }
};

// 2. Process one speaking turn (mocked Python integration)
export const processSpeakingTurnController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId, audioBase64, userTranscript } = req.body as {
            sessionId: string;
            audioBase64?: string;
            userTranscript?: string;
        };

        if (!sessionId) {
            return res.status(400).json(
                ApiResponse.fail("Thiếu tham số `sessionId`.")
            );
        }

        if (!audioBase64) {
            return res.status(400).json(
                ApiResponse.fail("Thiếu tham số `audioBase64`.")
            );
        }

        // Lấy session để đọc config và xác nhận session tồn tại
        const session = await ChatSession.findById(sessionId).lean();
        if (!session) {
            return res.status(404).json(
                ApiResponse.fail("Phiên luyện nói không tồn tại.")
            );
        }

        const config = (session.config || {}) as Partial<UserConfig>;

        // Lấy toàn bộ lịch sử hội thoại trong session để gửi làm context cho LLM
        const messagesInSession = await ChatMessage.find({
            session_id: sessionId,
        })
            .sort({ created_at: 1 })
            .lean();

        const historyContext: { role: "system" | "user" | "assistant"; content: string }[] = [];

        // System prompt mô tả bối cảnh luyện nói dựa trên config
        const systemParts: string[] = [
            "You are an English speaking partner helping the learner practice conversation.",
        ];

        if (config.scenario) {
            systemParts.push(`Scenario: ${config.scenario}.`);
        }
        if (config.level) {
            systemParts.push(`Learner level: ${config.level}.`);
        }
        if (config.userRole) {
            systemParts.push(`Learner role: ${config.userRole}.`);
        }
        if (config.botTone) {
            systemParts.push(`Your tone: ${config.botTone}.`);
        }
        if (config.goal) {
            systemParts.push(`Conversation goal: ${config.goal}.`);
        }
        if (config.durationMinutes) {
            systemParts.push(`Target duration: ${config.durationMinutes} minutes.`);
        }
        if (config.botSpeed) {
            systemParts.push(`Your speaking speed should be: ${config.botSpeed}.`);
        }

        historyContext.push({
            role: "system",
            content: systemParts.join(" "),
        });

        // Thêm lịch sử hội thoại user/bot trước đó
        for (const msg of messagesInSession) {
            const role: "user" | "assistant" = msg.sender === "user" ? "user" : "assistant";
            historyContext.push({ role, content: msg.text });
        }

        const PYTHON_BASE_URL = process.env.PYTHON_BASE_URL;

        // Convert WebM (FE) -> WAV (Azure yêu cầu)
        const wavBase64 = await convertWebmBase64ToWavBase64(audioBase64);

        // Gọi FastAPI /chat/turn với WAV base64, kèm theo context hội thoại và config
        const pythonResponse = await axios.post(`${PYTHON_BASE_URL}/chat/turn`, {
            context: historyContext,
            audio_base64: wavBase64,
            user_transcript: userTranscript ?? null,
            config,
        });

        const turnFromPython = pythonResponse.data?.turn as {
            feedback: {
                pronunciation_score: number;
                fluency_score: number;
                intonation_score: number;
                grammar_score: number;
                total_score: number;
                improvement_tip: string;
                mistakes: {
                    original: string;
                    correction: string;
                    type: "grammar" | "vocabulary" | "pronunciation";
                    explanation: string;
                }[];
            };
            bot_text: string;
            bot_translation: string;
            user_transcript: string;
            user_translation?: string;
            is_unintelligible: boolean;
            bot_audio_base64?: string;
        };

        if (!turnFromPython) {
            return res.status(500).json(
                ApiResponse.fail("Không nhận được dữ liệu hợp lệ từ Python speaking service.")
            );
        }

        // Map sang kiểu TurnResponse bên Node
        const turn: TurnResponse = {
            userTranscript: turnFromPython.user_transcript,
            userTranslation: turnFromPython.user_translation,
            isUnintelligible: turnFromPython.is_unintelligible,
            botText: turnFromPython.bot_text,
            botTranslation: turnFromPython.bot_translation,
            botAudioBase64: turnFromPython.bot_audio_base64,
            feedback: {
                pronunciationScore: turnFromPython.feedback.pronunciation_score,
                fluencyScore: turnFromPython.feedback.fluency_score,
                intonationScore: turnFromPython.feedback.intonation_score,
                grammarScore: turnFromPython.feedback.grammar_score,
                totalScore: turnFromPython.feedback.total_score,
                improvementTip: turnFromPython.feedback.improvement_tip,
                mistakes: turnFromPython.feedback.mistakes,
            },
        };

        // Lưu message user + bot vào Mongo như cũ
        const userMessage = await createChatMessageService(sessionId, "user", turn.userTranscript, {
            stt_text: turn.userTranscript,
            pronunciation_feedback: turn.feedback,
            is_unintelligible: turn.isUnintelligible,
        });

        const botMessage = await createChatMessageService(sessionId, "bot", turn.botText, {
            model: "speaking-python",
        });

        return res.status(200).json(
            ApiResponse.success(
                {
                    turn,
                    userMessageId: userMessage._id,
                    botMessageId: botMessage._id,
                },
                "Xử lý lượt luyện nói thành công"
            )
        );
    } catch (err) {
        next(err);
    }
};
