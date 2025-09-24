// src/services/day_study.service.ts
import { DayStudy, Lesson, IDayStudy } from "../models";

/**
 * Lấy chi tiết DayStudy + populate lessons
 */
export const getDayStudyByIdService = async (dayId: string) => {
  const day = await DayStudy.findById(dayId).select("accuracy_overall sessions -_id");

  if (!day) throw new Error("Không tìm thấy ngày học");

  return day;
};
