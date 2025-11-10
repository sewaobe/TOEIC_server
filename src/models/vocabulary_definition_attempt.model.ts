import { model, Schema, Types } from "mongoose";

export interface IVocabularyDefinitionAttempt extends Document {
    user_id: Types.ObjectId;
    vocabulary_id: Types.ObjectId;
    answer: string;
    is_correct: boolean;
    accuracy_score: number;
    attempt_at: Date;
}

const VocabularyDefinitionAttemptSchema = new Schema<IVocabularyDefinitionAttempt>({
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vocabulary_id: { type: Schema.Types.ObjectId, ref: "Vocabulary", required: true },
    answer: { type: String, required: true },
    is_correct: { type: Boolean, required: true },
    accuracy_score: { type: Number, required: true },
    attempt_at: { type: Date, default: Date.now },
})

export const VocabularyDefinitionAttempt = model<IVocabularyDefinitionAttempt>(
    "VocabularyDefinitionAttempt",
    VocabularyDefinitionAttemptSchema
);