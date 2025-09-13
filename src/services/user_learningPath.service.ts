import { UserLearningPath } from "../models/user_learningPath.model";

export const getUserLearningPathService = async (userId: string) => {
  return await UserLearningPath.findOne({ user_id: userId })
    .populate({
      path: "learningPath_id",
      populate: { path: "week_studies_id additional_week_studies" },
    });
};
