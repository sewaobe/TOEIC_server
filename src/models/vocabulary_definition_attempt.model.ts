import { model, Schema, Types } from "mongoose";

export interface IVocabularyDefinitionAttempt extends Document {
  user_id: Types.ObjectId;
  vocabulary_id: Types.ObjectId;
  session_id?: Types.ObjectId; // Liên kết với PracticeSession
  answer: string;
  is_correct: boolean;
  accuracy_score: number;
  mode: "definition" | "guess"; // Chế độ luyện tập
  attempt_at: Date;
}

const VocabularyDefinitionAttemptSchema =
  new Schema<IVocabularyDefinitionAttempt>({
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vocabulary_id: {
      type: Schema.Types.ObjectId,
      ref: "Vocabulary",
      required: true,
    },
    session_id: { type: Schema.Types.ObjectId, ref: "PracticeSession" },
    answer: { type: String, required: true },
    is_correct: { type: Boolean, required: true },
    accuracy_score: { type: Number, required: true },
    mode: { type: String, enum: ["definition", "guess"], required: true },
    attempt_at: { type: Date, default: Date.now },
  });

export const VocabularyDefinitionAttempt = model<IVocabularyDefinitionAttempt>(
  "VocabularyDefinitionAttempt",
  VocabularyDefinitionAttemptSchema
);
