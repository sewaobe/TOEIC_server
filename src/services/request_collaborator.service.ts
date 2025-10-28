import mongoose from "mongoose";
import { IRequestCollaborator, RequestCollaborator } from "../models/request_collaborator.model";
import { sendCollaboratorReviewEmail, sendCollaboratorThankyouEmail } from "./mail.service";

export const submitRequestCollaborator = async (data: IRequestCollaborator, user_id?: string) => {
    const newRequest = new RequestCollaborator(data);
    if (user_id) {
        newRequest.user_id = new mongoose.Types.ObjectId(user_id);
    }
    const saved = newRequest.save();
    if (!saved) {
        throw new Error("Failed to submit collaborator request.");
    }
    sendCollaboratorThankyouEmail(data.email, data.fullName).catch((err) => {
        console.error("Error sending collaborator thank you email:", err);
    }
    );
    return saved;
}

export const getAllRequests = async (page = 1, limit = 6) => {
    const total = await RequestCollaborator.countDocuments();
    const requests = await RequestCollaborator.find()
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec();

    return {
        items: requests,
        total,
        page,
        pageCount: Math.ceil(total / limit),
    }
}

export const updateRequestStatus = async (id: string, status: 'approved' | 'rejected', rejection_reason?: string) => {
    if (status === 'rejected' && !rejection_reason) {
        throw new Error("Rejection reason is required when rejecting a request.");
    }
    const updated = await RequestCollaborator.findByIdAndUpdate(
        id,
        { status, rejection_reason },
        { new: true }
    );
    if (!updated) {
        throw new Error("Failed to update request status.");
    }

    sendCollaboratorReviewEmail(
        updated.email,
        updated.fullName,
        status,
        rejection_reason
    ).catch((err) => {
        console.error("Error sending collaborator review email:", err);
    });

    return updated;
}

export const getRequestByUserId = async (user_id: string) => {
    const request = await RequestCollaborator.findOne({ user_id });
    return request;
}