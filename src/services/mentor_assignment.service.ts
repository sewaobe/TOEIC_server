import { Types } from "mongoose";
import {
  GroupUser,
  Lesson,
  Quiz,
  TopicVocabulary,
  User,
  Role,
} from "../models";

/**
 * Tự động gán mentor (CTV) cho học viên nếu chưa có.
 * Tiêu chí chọn:
 * 1) Ít học viên nhất
 * 2) Nếu hoà, ưu tiên người có đóng góp nội dung nhiều hơn (lesson + quiz + topic vocabulary)
 * Trả về mentorId (string) nếu gán thành công, null nếu không tìm thấy mentor phù hợp.
 */
export async function ensureMentorAssignedForUser(
  userId: string | Types.ObjectId
): Promise<string | null> {
  const userObjectId =
    typeof userId === "string" ? new Types.ObjectId(userId) : userId;

  // Nếu user đã có group/mentor thì trả về luôn
  const existingGroup = await GroupUser.findOne({
    students: userObjectId,
  }).lean();
  if (existingGroup && existingGroup.mentor_id) {
    return existingGroup.mentor_id.toString();
  }

  // Lấy danh sách CTV
  const collRole = await Role.findOne({ name: "collaborator" }).lean();
  if (!collRole) return null;

  const collaborators = await User.find({ role_id: collRole._id }).lean();
  if (!collaborators || collaborators.length === 0) return null;

  const mentorIds = collaborators.map((c: any) => c._id);
  const groups = await GroupUser.find({ mentor_id: { $in: mentorIds } }).lean();

  // Map mentor -> group (để lấy số học viên hiện tại)
  const groupMap = new Map<string, any>();
  for (const g of groups) groupMap.set((g.mentor_id || "").toString(), g);

  const studentCount = new Map<string, number>();
  for (const m of collaborators) {
    const key = (m._id || "").toString();
    const g = groupMap.get(key);
    studentCount.set(
      key,
      g && Array.isArray(g.students) ? g.students.length : 0
    );
  }

  // Tính điểm đóng góp nội dung
  const contribMap = new Map<string, number>();
  await Promise.all(
    collaborators.map(async (m: any) => {
      try {
        const [l, q, t] = await Promise.all([
          Lesson.countDocuments({ created_by: m._id }),
          Quiz.countDocuments({ created_by: m._id }),
          TopicVocabulary.countDocuments({ created_by: m._id }),
        ]);
        contribMap.set(
          (m._id || "").toString(),
          (l || 0) + (q || 0) + (t || 0)
        );
      } catch (err) {
        contribMap.set((m._id || "").toString(), 0);
      }
    })
  );

  // Chọn mentor: ít học viên nhất -> đóng góp nhiều nhất -> tie-break theo _id
  let minStudents = Infinity;
  for (const v of studentCount.values())
    if (typeof v === "number") minStudents = Math.min(minStudents, v);
  const candidates = collaborators.filter(
    (m: any) => studentCount.get((m._id || "").toString()) === minStudents
  );
  if (!candidates || candidates.length === 0) return null;

  candidates.sort((a: any, b: any) => {
    const ca = contribMap.get((a._id || "").toString()) || 0;
    const cb = contribMap.get((b._id || "").toString()) || 0;
    if (ca !== cb) return cb - ca;
    return (a._id || "").toString().localeCompare((b._id || "").toString());
  });

  const chosen = candidates[0];
  if (!chosen) return null;

  // Thêm user vào group của mentor (tạo group nếu chưa có)
  const chosenKey = (chosen._id || "").toString();
  const chosenGroup = groupMap.get(chosenKey);

  if (chosenGroup) {
    await GroupUser.updateOne(
      { _id: chosenGroup._id },
      { $addToSet: { students: userObjectId } }
    );
  } else {
    const groupName = chosen.profile?.fullname
      ? `Nhóm ${chosen.profile.fullname}`
      : "Nhóm học viên";
    await GroupUser.create({
      name: groupName,
      mentor_id: chosen._id,
      students: [userObjectId],
      created_at: new Date(),
    } as any);
  }

  return chosen._id.toString();
}
