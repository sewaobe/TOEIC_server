import { Role, User } from "../models";
import { pushNotification} from "./pushNotification";

export const pushNotificationToAdmin = async (user_id: string, data: {
    message: string;
    type?: "system" | "comment" | "error" | "chat" | "test";
    url?: string;
}) => {
    // Tìm tất cả admin trong hệ thống
    const adminRole = await Role.findOne({ name: "admin" });
    if (adminRole) {
        const adminUsers = await User.find({ role_id: adminRole._id }).select("_id email");

        // Gửi thông báo tới từng admin
        for (const admin of adminUsers) {
            await pushNotification({
                senderId: user_id, // người gửi (nếu có)
                recipientId: admin._id.toString(),
                message: data.message,
                type: data.type || "system",
                url: data.url || "", // có thể dẫn tới trang quản trị
            });
        }
    }
}