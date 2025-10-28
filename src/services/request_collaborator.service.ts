import mongoose from "mongoose";
import { IRequestCollaborator, RequestCollaborator } from "../models/request_collaborator.model";
import { sendCollaboratorReviewEmail, sendCollaboratorThankyouEmail } from "./mail.service";
import { Role, User } from "../models";
import { pushNotification } from "../utils/pushNotification";

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

    // Tìm tất cả admin trong hệ thống
    const adminRole = await Role.findOne({ name: "admin" });
    if (adminRole) {
        const adminUsers = await User.find({ role_id: adminRole._id }).select("_id email");

        // Gửi thông báo tới từng admin
        for (const admin of adminUsers) {
            await pushNotification({
                senderId: user_id, // người gửi (nếu có)
                recipientId: admin._id.toString(),
                message: `📩 Có đơn cộng tác viên mới từ ${data.fullName}`,
                type: "system",
                url: "http://localhost:5174/admin/collaborators", // có thể dẫn tới trang quản trị
            });
        }
    }

    return saved;

}

export const getAllRequests = async (page = 1, limit = 6) => {
    const total = await RequestCollaborator.countDocuments();
    const requests = await RequestCollaborator.find()
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate({
            path: "user_id",
            select: "badges master_parts profile.avatar",
            populate: {
                path: "badges",
                select: "-__v -created_at -updated_at"
            }
        })
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


    if (status === 'approved') {
        if (updated.user_id) {
            const role_collaborator_id = await Role.findOne({ name: 'collaborator' }).select('_id');

            if (!role_collaborator_id) {
                throw new Error("Collaborator role not found.");
            }

            await User.findByIdAndUpdate(
                updated.user_id,
                { $set: { role_id: role_collaborator_id._id } }
            );
        } else {
            const user_new = new User({
                email: updated.email,
                fullName: updated.fullName,
                isActive: true,
            });
            await user_new.save();
        }
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