import { model, Schema, Types } from "mongoose";

export interface IVocabularyDefinitionAttempt extends Document {
  user_id: Types.ObjectId;
  vocabulary_word_id: Types.ObjectId; // Đổi từ vocabulary_id sang vocabulary_word_id
  practice_topic_id?: Types.ObjectId; // Thêm để liên kết với PracticeTopicVocabulary
  session_id?: Types.ObjectId; // Liên kết với PracticeSession
  answer: string;
  is_correct: boolean;
  accuracy_score: number;
  attempt_at: Date;
}

const VocabularyDefinitionAttemptSchema =
  new Schema<IVocabularyDefinitionAttempt>({
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vocabulary_word_id: {
      type: Schema.Types.ObjectId,
      ref: "VocabularyWord",
      required: true,
    },
    practice_topic_id: {
      type: Schema.Types.ObjectId,
      ref: "PracticeTopicVocabulary",
    },
    session_id: { type: Schema.Types.ObjectId, ref: "PracticeSession" },
    answer: { type: String, required: true },
    is_correct: { type: Boolean, required: true },
    accuracy_score: { type: Number, required: true },
    attempt_at: { type: Date, default: Date.now },
  });

export const VocabularyDefinitionAttempt = model<IVocabularyDefinitionAttempt>(
  "VocabularyDefinitionAttempt",
  VocabularyDefinitionAttemptSchema
);
