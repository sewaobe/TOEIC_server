import { model, Schema, Types, Document } from "mongoose";

export type PracticeType = "definition_based" | "fill_blank" | "listening" | "reading" | "grammar";
export type SessionStatus = "in_progress" | "completed" | "cancelled";

export interface IPracticeSession extends Document {
    user_id: Types.ObjectId;
    practice_type: PracticeType;
    topic_id: Types.ObjectId;
    status: SessionStatus;
    
    // Tracking chi tiết
    total_items: number;
    completed_items: number;
    current_index: number;
    
    // Kết quả
    correct_count: number;
    total_accuracy: number;
    
    // Thời gian
    started_at: Date;
    last_activity_at: Date;
    completed_at?: Date;
}

const PracticeSessionSchema = new Schema<IPracticeSession>({
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    practice_type: { 
        type: String, 
        enum: ["definition_based", "fill_blank", "listening", "reading", "grammar"],
        required: true,
        index: true
    },
    topic_id: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { 
        type: String, 
        enum: ["in_progress", "completed", "cancelled"],
        default: "in_progress",
        index: true
    },
    
    total_items: { type: Number, required: true, default: 0 },
    completed_items: { type: Number, default: 0 },
    current_index: { type: Number, default: 0 },
    
    correct_count: { type: Number, default: 0 },
    total_accuracy: { type: Number, default: 0 },
    
    started_at: { type: Date, default: Date.now },
    last_activity_at: { type: Date, default: Date.now },
    completed_at: { type: Date }
}, {
    timestamps: true
});

// Index compound để query nhanh
PracticeSessionSchema.index({ user_id: 1, practice_type: 1, status: 1 });
PracticeSessionSchema.index({ user_id: 1, topic_id: 1, practice_type: 1 });

export const PracticeSession = model<IPracticeSession>(
    "PracticeSession",
    PracticeSessionSchema
);
