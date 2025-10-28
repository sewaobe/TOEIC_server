import {
  User,
  UserProgress,
  LearningPath,
  UserTest,
  IUserProgress,
  IUserLearningPath,
  UserLearningPath,
  Role,
  UserActivity,
} from "../models";
import { Types } from "mongoose";
import { ProfileDto } from "../dto/profile.dto";

// Lấy profile user theo username, trả về dạng ProfileDto
export const getProfileUserByUsername = async (
  username: string
): Promise<ProfileDto | null> => {
  // Lấy user
  const user = await User.findOne({ username })
    .select("-passwordHash")
    .populate("badges")
    .lean();
  if (!user) return null;

  const userId = new Types.ObjectId(user._id);

  // Lấy progress nguyên bản + populate learning_path_id
  const progressList: (IUserLearningPath & { learning_path_id?: any })[] =
    await UserLearningPath.find({ user_id: userId })
      .populate("learningPath_id") // populate thông tin learning path
      .lean();

  // Lấy bài test có điểm cao nhất
  const userTest = await UserTest.findOne({ user_id: userId })
    .sort({ score: -1 })
    .lean();

  let highestTest = null;
  if (userTest) {
    const answers = Array.isArray(userTest.answers) ? userTest.answers : [];
    const correctCount = answers.filter((a: any) => a?.isCorrect).length;
    const listeningCorrect = answers
      .slice(0, 100)
      .filter((a: any) => a?.isCorrect).length;
    const readingCorrect = answers
      .slice(100, 200)
      .filter((a: any) => a?.isCorrect).length;

    highestTest = {
      testId: userTest.test_id.toString(),
      score: userTest.score,
      correctCount,
      listeningCorrect,
      readingCorrect,
    };
  }

  // Trả về DTO
  const profile: ProfileDto = {
    infor: user,
    progress: progressList, // trả nguyên bản progress
    highestTest,
  };

  return profile;
};

// Lấy user theo ID
export const getUserById = async (id: string) => {
  const user = await User.findById(id)
    .select("-passwordHash")
    .populate("role_id", "name")
    .lean();

  if (!user) return null;

  return {
    ...user,
    role_name: (user.role_id as any).name,
    role_id: undefined, // ẩn role_id
  };
};

// =================== Admin helpers ===================
// Map DB user doc to FE-friendly summary/detail shape
const mapUserDocToDto = (userDoc: any) => {
  if (!userDoc) return null;

  // Nếu có dấu hiệu bị ban (banned_at hoặc banned_by) -> suspended ưu tiên hơn inactive
  const status =
    userDoc.banned_at || userDoc.banned_by
      ? "suspended"
      : !userDoc.isActive
      ? "inactive"
      : "active";

  return {
    id: userDoc._id.toString(),
    name: userDoc.profile?.fullname || userDoc.username || userDoc.email,
    username: userDoc.username,
    email: userDoc.email,
    role_id: userDoc.role_id
      ? {
          _id: (userDoc.role_id as any)._id?.toString() || userDoc.role_id,
          name: (userDoc.role_id as any).name,
        }
      : undefined,
    status,
    avatar: userDoc.profile?.avatar || "",
    created_at: userDoc.created_at,
    last_active: userDoc.last_active,
    badges: userDoc.badges || [],
    topic_vocabularies: userDoc.topic_vocabularies || [],
    master_parts: userDoc.master_parts || [],
    // Trả thông tin ban để FE có thể hiện nút Mở khóa
    banned_at: userDoc.banned_at || null,
    banned_by: userDoc.banned_by ? (userDoc.banned_by as any).toString() : null,
  };
};

/**
 * List users with optional search, role and status filters and pagination
 * Params: { q, role, status, page = 1, limit = 10 }
 */
export const listUsers = async (params: {
  q?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
}) => {
  const { q, role, status, page = 1, limit = 10 } = params;

  const filter: any = {};

  // status mapping: active | inactive | suspended
  if (status) {
    if (status === "active") {
      filter.isActive = true;
      filter.banned_at = { $exists: false };
    } else if (status === "inactive") {
      filter.isActive = false;
    } else if (status === "suspended") {
      filter.banned_at = { $exists: true };
    }
  }

  // role name -> role_id
  if (role) {
    const roleDoc = await Role.findOne({ name: role }).lean();
    if (roleDoc) filter.role_id = roleDoc._id;
    else filter.role_id = null; // no match
  }

  if (q) {
    const re = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ email: re }, { username: re }, { "profile.fullname": re }];
  }

  const skip = Math.max(0, page - 1) * limit;

  const [items, total] = await Promise.all([
    User.find(filter)
      .select("-passwordHash")
      .populate("role_id", "name")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  const data = items.map(mapUserDocToDto);

  return { data, total, page, limit };
};

export const getUserDetailById = async (id: string) => {
  const user = await User.findById(id)
    .select("-passwordHash")
    .populate("role_id", "name")
    .populate("badges")
    .populate("topic_vocabularies")
    .lean();

  if (!user) return null;

  return mapUserDocToDto(user);
};

/** Ban a user (temp or perm) and record an audit activity */
export const banUser = async (
  userId: string,
  adminId: string,
  options: { type: "temp" | "perm"; reason: string; durationDays?: number }
) => {
  const userObjId = new Types.ObjectId(userId);
  const adminObjId = new Types.ObjectId(adminId);

  const now = new Date();

  // set banned_at and deactivate
  const update: any = {
    banned_at: now,
    banned_by: adminObjId,
    isActive: false,
    updated_at: now,
  };

  // we can't persist arbitrary fields if schema doesn't allow; store duration in activity metadata

  const updated = await User.findByIdAndUpdate(
    userObjId,
    { $set: update },
    { new: true }
  )
    .select("-passwordHash")
    .populate("role_id", "name")
    .lean();

  // Log activity for audit
  await UserActivity.create({
    user_id: userObjId,
    type: "OTHER",
    title: options.type === "temp" ? "Tạm khóa tài khoản" : "Ban vĩnh viễn",
    description: options.reason,
    metadata: {
      action: "ban",
      type: options.type,
      durationDays: options.durationDays || null,
      by: adminObjId.toString(),
    },
  });

  return mapUserDocToDto(updated);
};

export const unbanUser = async (userId: string, adminId?: string) => {
  const userObjId = new Types.ObjectId(userId);

  const update: any = {
    banned_at: null,
    banned_by: null,
    isActive: true,
    updated_at: new Date(),
  };

  const updated = await User.findByIdAndUpdate(
    userObjId,
    { $set: update },
    { new: true }
  )
    .select("-passwordHash")
    .populate("role_id", "name")
    .lean();

  // Log unban activity
  await UserActivity.create({
    user_id: userObjId,
    type: "OTHER",
    title: "Mở khóa tài khoản",
    description: adminId ? `Unbanned by ${adminId}` : "Unbanned",
    metadata: { action: "unban", by: adminId || null },
  });

  return mapUserDocToDto(updated);
};

// Cập nhật profile user
export const updateUserProfile = async (
  userId: string,
  updateData: Partial<{
    profile: { fullname?: string; avatar?: string };
    email?: string;
  }>
) => {
  return User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true, runValidators: true }
  ).select("email profile.fullname profile.avatar");
};
