import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

export async function generateAnswer(question: string, context: string) {
    const prompt = `
        Bạn là trợ lý TOEIC thân thiện, chỉ trả lời dựa trên thông tin được cung cấp dưới đây.
        Nếu người dùng hỏi về chủ đề ngoài TOEIC hoặc ngoài dữ liệu, bạn PHẢI trả lời:
        "Mình chưa có thông tin cho câu này."

        --- DỮ LIỆU LIÊN QUAN (context) ---
        ${context}
        ------------------------------------

        Người học hỏi: "${question}"

        Yêu cầu:
        - Trả lời ngắn gọn, chính xác, chỉ dựa trên thông tin trong context.
        - Nếu context không chứa thông tin, nói đúng mẫu câu trên.
        - Viết bằng tiếng Việt tự nhiên, thân thiện, dễ hiểu.
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
