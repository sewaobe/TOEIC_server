import mongoose, { Document, Schema } from "mongoose"

export interface UserSessionEntity {
    userId: string;
    refreshToken: string;
    device_info: string;
    ip_address: string;
    expires_at: Date;
}

interface UserSession extends UserSessionEntity, Document { }

const userSessionSchema = new Schema<UserSession>({
    userId: { type: String, required: true, ref: "User" },
    refreshToken: { type: String, required: true },
    device_info: { type: String, required: true },
    ip_address: { type: String, required: true },
    expires_at: { type: Date, required: true, expires: 0 }, // Mongoose sẽ tự động xóa document khi đến thời điểm expires_at
}, {
    timestamps: true,
});

export const UserSessionModel = mongoose.model<UserSession>("UserSession", userSessionSchema);