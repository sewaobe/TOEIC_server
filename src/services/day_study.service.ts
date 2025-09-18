// src/services/day_study.service.ts
import { DayStudy, Lesson, IDayStudy } from "../models";

/**
 * Lấy chi tiết DayStudy + populate lessons
 */
export const getDayStudyByIdService = async (dayId: string) => {
  const day = await DayStudy.findById(dayId)
    .populate({
      path: "sessions.items.lesson_id",
      model: Lesson, // populate lesson
    })
    .exec();

  if (!day) throw new Error("Không tìm thấy ngày học");

  return day as IDayStudy;
};
