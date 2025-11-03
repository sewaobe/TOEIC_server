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

  // Prefer explicit status if present, otherwise infer for backward compatibility
  const status = userDoc.status
    ? userDoc.status
    : userDoc.banned_at || userDoc.banned_by
    ? "banned"
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
    // Trả thông tin ban để FE có thể hiện nút Mở khóa / hiển thị lý do
    banned_at: userDoc.banned_at || null,
    banned_by: userDoc.banned_by ? 
      (userDoc.banned_by.profile?.fullname || userDoc.banned_by.username || userDoc.banned_by.email || userDoc.banned_by.toString()) : null,
    banned_reason: userDoc.banned_reason || null,
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
    // support new status values: active | inactive | banned | banned_permanent
    if (status === "active") {
      // either explicit status or legacy fields
      filter.$or = [
        { status: "active" },
        {
          status: { $exists: false },
          isActive: true,
          banned_at: { $exists: false },
        },
      ];
    } else if (status === "inactive") {
      filter.$or = [
        { status: "inactive" },
        { status: { $exists: false }, isActive: false },
      ];
    } else if (status === "banned") {
      filter.$or = [
        { status: "banned" },
        { status: { $exists: false }, banned_at: { $exists: true } },
      ];
    } else if (status === "banned_permanent") {
      filter.status = "banned_permanent";
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
      .populate("banned_by", "profile.fullname username email") // ✅ Populate thông tin người ban
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
    .populate("banned_by", "profile.fullname username email") // ✅ Populate thông tin người ban
    .populate("badges")
    // .populate("topic_vocabularies")
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
    banned_reason: options.reason || null,
  };

  // set ban type / status / expiry
  if (options.type === "perm") {
    update.status = "banned_permanent";
  } else {
    // temporary ban; expiry is stored in activity metadata, not on User
    update.status = "banned";
  }

  // we can't persist arbitrary fields if schema doesn't allow; store duration in activity metadata

  const updated = await User.findByIdAndUpdate(
    userObjId,
    { $set: update },
    { new: true }
  )
    .select("-passwordHash")
    .populate("role_id", "name")
    .populate("banned_by", "profile.fullname username email") // ✅ Populate thông tin người ban
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

  // Prevent unbanning permanent bans via this endpoint
  const existing = await User.findById(userObjId).lean();
  if (existing && existing.status === "banned_permanent") {
    throw new Error("Cannot unban a permanently banned user");
  }

  const update: any = {
    banned_at: null,
    banned_by: null,
    banned_reason: null,
    isActive: true,
    status: "active",
    updated_at: new Date(),
  };

  const updated = await User.findByIdAndUpdate(
    userObjId,
    { $set: update },
    { new: true }
  )
    .select("-passwordHash")
    .populate("role_id", "name")
    .populate("banned_by", "profile.fullname username email") // ✅ Populate thông tin người ban (sẽ là null sau unban)
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
