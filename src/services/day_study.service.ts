// src/services/day_study.service.ts
import { Types } from "mongoose";
import { DayStudy, Lesson, IDayStudy } from "../models";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";

/**
 * Lấy chi tiết DayStudy + populate lessons
 */
export const getDayStudyByIdService = async (dayId: string) => {
  const day = await DayStudy.findById(dayId).select("accuracy_overall sessions -_id");

  if (!day) throw new Error("Không tìm thấy ngày học");

  return day;
};

export async function completeActivityAndUnlockNext(
  dayStudyId: string | Types.ObjectId,
  completedActivityId: string | Types.ObjectId
): Promise<IDayStudy | null> {
  const currentDay = await DayStudy.findById(dayStudyId);

  if (!currentDay) {
    console.error(`[Error] Không tìm thấy DayStudy với ID: ${dayStudyId}`);
    return null;
  }

  let currentSessionIndex = -1;
  let currentItemIndex = -1;

  for (let i = 0; i < currentDay.sessions.length; i++) {
    const itemIdx = currentDay.sessions[i].items.findIndex(
      item => item.activity_id?.toString() === completedActivityId.toString()
    );
    if (itemIdx !== -1) {
      currentSessionIndex = i;
      currentItemIndex = itemIdx;
      break;
    }
  }

  if (currentSessionIndex === -1) {
    console.error(`[Error] Không tìm thấy activity_id ${completedActivityId} trong DayStudy.`);
    return null;
  }

  const currentSession = currentDay.sessions[currentSessionIndex];
  currentSession.items[currentItemIndex].status = WeekStudyStatus.COMPLETED;

  const nextItemIndex = currentItemIndex + 1;
  if (nextItemIndex < currentSession.items.length) {
    currentSession.items[nextItemIndex].status = WeekStudyStatus.IN_PROGRESS;
  } else {
    currentSession.status = WeekStudyStatus.COMPLETED;

    const nextSessionIndex = currentSessionIndex + 1;
    if (nextSessionIndex < currentDay.sessions.length) {
      const nextSession = currentDay.sessions[nextSessionIndex];
      nextSession.status = WeekStudyStatus.IN_PROGRESS;
      if (nextSession.items.length > 0) {
        nextSession.items[0].status = WeekStudyStatus.IN_PROGRESS;
      }
    } else {
      // Đánh dấu ngày hiện tại là hoàn thành
      currentDay.status = WeekStudyStatus.COMPLETED;

      // Tìm và mở khóa DayStudy của ngày tiếp theo
      const nextDayStudy = await DayStudy.findOne({
        week_id: currentDay.week_id, // Cùng week_id
        dayOfWeek: { $gt: currentDay.dayOfWeek } // dayOfWeek lớn hơn ngày hiện tại
      }).sort({ dayOfWeek: 1 }); // Sắp xếp để lấy ngày gần nhất

      if (nextDayStudy) {
        nextDayStudy.status = WeekStudyStatus.IN_PROGRESS;

        // Mở khóa luôn session và item đầu tiên của ngày mới để người dùng có thể bắt đầu ngay
        if (nextDayStudy.sessions.length > 0) {
          nextDayStudy.sessions[0].status = WeekStudyStatus.IN_PROGRESS;
          if (nextDayStudy.sessions[0].items.length > 0) {
            nextDayStudy.sessions[0].items[0].status = WeekStudyStatus.IN_PROGRESS;
          }
        }
        
        // Lưu lại thay đổi của ngày tiếp theo
        await nextDayStudy.save();
        console.log(`Đã mở khóa ngày học tiếp theo (DayOfWeek: ${nextDayStudy.dayOfWeek})!`);
      } else {
        // Nếu không còn ngày nào, có thể bạn muốn cập nhật trạng thái của cả tuần học
        console.log("Bạn đã hoàn thành tất cả các ngày trong tuần!");
        // Ví dụ: await WeekStudy.findByIdAndUpdate(currentDay.week_id, { status: 'completed' });
      }
    }
  }
  // Lưu lại thay đổi của ngày hiện tại
  return await currentDay.save();
}