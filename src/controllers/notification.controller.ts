import { Request, Response, NextFunction } from "express";
import {
    createNotification,
    listNotifications,
    markNotificationAsRead,
} from "../services/notification.service";
import { ApiResponse } from "../utils/ApiResponse";
import { sendWebPushToUser } from "../services/push.service";
import { io, onlineUsers } from "../socket";

export const getNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = (req as any).user._id;
        if (!userId) {
            return res
                .status(401)
                .json(ApiResponse.fail("Bạn không có quyền xem danh sách thông báo!", 401));
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        // Lấy dữ liệu từ service (trả về { notifications, total })
        const { notifications, total, unreadCount } = await listNotifications(userId, page, limit);

        // Tính tổng số trang
        const pageCount = Math.ceil(total / limit);

        return res.status(200).json(
            ApiResponse.success(
                {
                    items: notifications,
                    total,
                    page,
                    pageCount,
                    unreadCount
                },
                "Lấy danh sách thông báo thành công!"
            )
        );
    } catch (error) {
        next(error);
    }
};

export const markAsRead = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = (req as any).user._id;
        const notifId = req.params.id;
        if (!userId) {
            return res
                .status(401)
                .json(ApiResponse.fail("Bạn không có quyền cập nhật thông báo!", 401));
        }

        const notif = await markNotificationAsRead(notifId, userId);
        if (!notif) {
            return res
                .status(404)
                .json(ApiResponse.fail("Không tìm thấy thông báo cần cập nhật!", 404));
        }

        return res
            .status(200)
            .json(ApiResponse.success(notif, "Đánh dấu thông báo đã đọc thành công!"));
    } catch (error) {
        next(error);
    }
};

export const sendNotification = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const senderId = req.user._id;
        const { recipientId, message, type } = req.body;

        if (!recipientId) {
            return res
                .status(400)
                .json(ApiResponse.fail("Thiếu recipientId để gửi thông báo!", 400));
        }

        // Tạo bản ghi Notification trong DB
        const notif = await createNotification({
            senderId,
            recipientId,
            message: message || "Đây là thông báo thử nghiệm từ hệ thống Web Push 💫",
            type: type || "test",
        });

        // Gửi Web Push ra trình duyệt
        await sendWebPushToUser(recipientId, {
            title: "Thông báo thử nghiệm",
            body: message || "Đây là thông báo test từ hệ thống 💫",
            url: "https://your-frontend-url.com/dashboard", // ← thay bằng URL dashboard thật
        });

        const socketId = onlineUsers.get(recipientId.toString());
        if (socketId) {
            io.to(socketId).emit("receiveNotification", notif);
            console.log(`Socket emit tới user ${recipientId} (${socketId})`);
        } else {
            console.log(`User ${recipientId} offline, chỉ gửi Web Push`);
        }

        return res
            .status(200)
            .json(ApiResponse.success(notif, "Đã gửi thông báo thử nghiệm thành công!"));
    } catch (error) {
        next(error);
    }
};
