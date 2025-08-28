import { User, UserProgress, LearningPath, UserTest, IUserProgress } from "../models";
import { Types } from "mongoose";
import { ProfileDto } from "../dto/profile.dto";

// Lấy profile user theo username, trả về dạng ProfileDto
export const getProfileUserByUsername = async (
  username: string
): Promise<ProfileDto | null> => {
  // Lấy user
  const user = await User.findOne({ username }).select("-passwordHash").populate("badges").lean();
  if (!user) return null;

  const userId = new Types.ObjectId(user._id);

  // Lấy progress nguyên bản + populate learning_path_id
  const progressList: (IUserProgress & { learning_path_id?: any })[] =
    await UserProgress.find({ user_id: userId })
      .populate("learningPaths_id") // populate thông tin learning path
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
  return User.findById(id).select("-passwordHash");
};

// Cập nhật profile user
export const updateUserProfile = async (
  userId: string,
  updateData: Partial<{ profile: { fullname?: string; avatar?: string }; email?: string }>
) => {
  return User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true, runValidators: true }
  ).select("email profile.fullname profile.avatar");
};
