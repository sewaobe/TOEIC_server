import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import { ChatType } from "../models/chat_session.model";
import { createChatSessionService, createChatMessageService } from "../services/chat.service";

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
            audioBase64?: string; // currently unused (Python call will use it later)
            userTranscript?: string; // optional manual transcript
        };

        if (!sessionId) {
            return res.status(400).json(
                ApiResponse.fail("Thiếu tham số `sessionId`.")
            );
        }

        // In the future, this is where you'll call the Python speaking backend
        // and map its response to TurnResponse. For now, we mock it safely.

        const mockedTranscript = userTranscript || "Hello, this is a sample user sentence.";

        const mockedTurnResponse: TurnResponse = {
            userTranscript: mockedTranscript,
            userTranslation: undefined,
            isUnintelligible: false,
            botText: "Thanks for sharing! Your pronunciation is generally clear. Let's keep practicing.",
            botTranslation: "Cảm ơn bạn, phát âm của bạn nhìn chung khá rõ. Hãy tiếp tục luyện tập nhé.",
            feedback: {
                pronunciationScore: 85,
                fluencyScore: 80,
                intonationScore: 78,
                grammarScore: 82,
                totalScore: 81,
                improvementTip: "Try to slow down slightly and pay attention to word stress.",
                mistakes: [
                    {
                        original: "pronounciation",
                        correction: "pronunciation",
                        type: "pronunciation",
                        explanation: "The stress should be on 'nun', not 'noun'.",
                    },
                ],
            },
        };

        // Persist user message (with feedback) and bot message using shared chat service
        const userMessage = await createChatMessageService(sessionId, "user", mockedTurnResponse.userTranscript, {
            stt_text: mockedTurnResponse.userTranscript,
            pronunciation_feedback: mockedTurnResponse.feedback,
            is_unintelligible: mockedTurnResponse.isUnintelligible,
        });

        const botMessage = await createChatMessageService(sessionId, "bot", mockedTurnResponse.botText, {
            model: "speaking-mock",
        });

        return res.status(200).json(
            ApiResponse.success(
                {
                    turn: mockedTurnResponse,
                    userMessageId: userMessage._id,
                    botMessageId: botMessage._id,
                },
                "Xử lý lượt luyện nói thành công (mock)"
            )
        );
    } catch (err) {
        next(err);
    }
};
