import { Notification } from "../models/notification.model";

export async function createNotification(data: {
    senderId?: string;
    recipientId: string;
    message: string;
    type?: string;
    description?: string;
}) {
    const notification = await Notification.create({
        ...data,
        type: data.type || "system",
    });
    return notification;
}

export const listNotifications = async (userId: string, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;

    // Tổng số thông báo của user
    const total = await Notification.countDocuments({ recipientId: userId });

    //Tổng thông báo chưa đọc (tính toàn bộ)
    const unreadCount = await Notification.countDocuments({
        recipientId: userId,
        isRead: false,
    });

    // Lấy danh sách, sắp xếp mới nhất trước
    const notifications = await Notification.find({ recipientId: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    return { notifications, total, unreadCount };
};

export async function markNotificationAsRead(notifId: string, userId: string) {
    return Notification.findOneAndUpdate(
        { _id: notifId, recipientId: userId },
        { isRead: true },
        { new: true }
    );
}

export async function createWelcomeNotificationOnce(userId: string) {
    // Kiểm tra có thông báo chào mừng nào cho user chưa
    const existing = await Notification.findOne({
        recipientId: userId,
        type: "system",
        message: " Chào mừng bạn đến với Dashboard!",
    });

    // Nếu đã có → bỏ qua
    if (existing) return null;

    // Nếu chưa có → tạo mới
    const notif = await Notification.create({
        recipientId: userId,
        type: "system",
        message: " Chào mừng bạn đến với Dashboard!",
        isRead: false,
    });

    return notif;
}