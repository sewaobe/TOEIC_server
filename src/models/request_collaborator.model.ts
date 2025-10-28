import mongoose, { Document, Schema, Types } from "mongoose";

export interface IRequestCollaborator extends Document {
    user_id?: Types.ObjectId;
    fullName: string;
    email: string;
    experience: string;
    expertise?: string[];
    motivation: string;
    availability: "part-time" | "full-time" | "flexible";
    cv_url: string;
    status: 'pending' | 'approved' | 'rejected';
    rejection_reason?: string;
    created_at?: Date;
    updated_at?: Date;
}

const requestCollaboratorSchema = new Schema<IRequestCollaborator>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: "User", required: false },
        fullName: { type: String, required: true },
        email: { type: String, required: true },
        experience: { type: String, required: true },
        expertise: [{ type: String }],
        motivation: { type: String, required: true },
        availability: {
            type: String,
            enum: ["part-time", "full-time", "flexible"],
            required: true,
        },
        cv_url: { type: String, required: true },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },
        rejection_reason: { type: String, required: false },
    },
    {
        timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    }
);

export const RequestCollaborator = mongoose.model<IRequestCollaborator>(
    "RequestCollaborator",
    requestCollaboratorSchema
);