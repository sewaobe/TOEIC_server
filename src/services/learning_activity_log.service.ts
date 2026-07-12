import { Types } from "mongoose";
import type { IDayStudy } from "../models/day_study.model";
import { SessionType } from "../models/enums/SessionType";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import { UserActivity } from "../models/user_activity.model";

export type LearningActivityCompletionSource = "normal_learning" | "mock_learning";

export type LogLearningActivityCompletedInput = {
  userId?: string | Types.ObjectId;
  dayStudy: IDayStudy;
  sessionIndex: number;
  completedItemIndexes?: number[];
  score?: number | null;
  attemptId?: string | Types.ObjectId | null;
  completionSource?: LearningActivityCompletionSource;
  learningPathId?: string | Types.ObjectId | null;
  weekStudyId?: string | Types.ObjectId | null;
};

function toObjectId(value?: string | Types.ObjectId | null) {
  if (!value) return null;
  if (value instanceof Types.ObjectId) return value;
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;
}

function getCompletedItemIndexes(input: {
  dayStudy: IDayStudy;
  sessionIndex: number;
  completedItemIndexes?: number[];
}) {
  const session = input.dayStudy.sessions[input.sessionIndex];
  if (!session) return [];

  if (input.completedItemIndexes && input.completedItemIndexes.length > 0) {
    return Array.from(new Set(input.completedItemIndexes)).sort(
      (left, right) => left - right
    );
  }

  return (session.items ?? [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status === WeekStudyStatus.COMPLETED)
    .map(({ index }) => index);
}

export async function logLearningActivityCompleted(
  input: LogLearningActivityCompletedInput
) {
  const {
    userId,
    dayStudy,
    sessionIndex,
    score,
    attemptId,
    completionSource = "normal_learning",
    learningPathId,
    weekStudyId,
  } = input;

  if (!userId) return;

  try {
    const session = dayStudy.sessions[sessionIndex];
    if (!session) return;

    const userObjectId = toObjectId(userId);
    if (!userObjectId) return;

    const completedItemIndexes = getCompletedItemIndexes(input);
    const completedItems = completedItemIndexes
      .map((index) => ({ item: session.items?.[index], index }))
      .filter(({ item }) => Boolean(item));

    if (completedItems.length === 0) return;

    const lessonManagerObjectId = toObjectId(
      session.lesson_manager_id ??
        completedItems.find(({ item }) => item?.source_lesson_manager_id)?.item
          ?.source_lesson_manager_id ??
        null
    );

    const duplicateQuery = {
      user_id: userObjectId,
      type: "LEARNING_ACTIVITY_COMPLETED",
      "metadata.day_study_id": dayStudy._id,
      "metadata.session_no": session.session_no,
      "metadata.lesson_manager_id": lessonManagerObjectId,
    };

    const existed = await UserActivity.exists(duplicateQuery);
    if (existed) return;

    const completedActivityKinds = Array.from(
      new Set(
        completedItems
          .map(({ item }) => item?.kind)
          .filter((kind): kind is SessionType => Boolean(kind))
      )
    );
    const completedActivityIds = completedItems.map(
      ({ item }) => item?.activity_id ?? null
    );
    const lessonManagerTitle = session.lesson_manager_title || "";
    const titleTarget = lessonManagerTitle || "bài học";
    const attemptObjectId = toObjectId(attemptId);
    const learningPathObjectId = toObjectId(learningPathId);
    const weekStudyObjectId = toObjectId(weekStudyId ?? dayStudy.week_id);

    await UserActivity.create({
      user_id: userObjectId,
      type: "LEARNING_ACTIVITY_COMPLETED",
      title: `Hoàn thành bài học: ${titleTarget}`,
      description: `Hoàn thành bài học ở stage ${
        Number(dayStudy.dayOfWeek ?? 0) + 1
      }, session ${session.session_no}`,
      related_id: lessonManagerObjectId || undefined,
      metadata: {
        completionSource,
        learning_path_id: learningPathObjectId,
        learningPathId: learningPathObjectId ? String(learningPathObjectId) : null,
        week_study_id: weekStudyObjectId,
        weekStudyId: weekStudyObjectId ? String(weekStudyObjectId) : null,
        day_study_id: dayStudy._id,
        dayStudyId: String(dayStudy._id),
        session_no: session.session_no,
        sessionNo: session.session_no,
        completed_item_count: completedItems.length,
        completedItemCount: completedItems.length,
        completed_activity_kinds: completedActivityKinds,
        completedActivityKinds,
        completed_item_indexes: completedItemIndexes,
        completedItemIndexes,
        completed_activity_ids: completedActivityIds,
        completedActivityIds: completedActivityIds.map((activityId) =>
          activityId ? String(activityId) : null
        ),
        lesson_manager_id: lessonManagerObjectId,
        lessonManagerId: lessonManagerObjectId
          ? String(lessonManagerObjectId)
          : null,
        lesson_manager_title: lessonManagerTitle,
        lessonManagerTitle,
        dayOfWeek: dayStudy.dayOfWeek,
        score: score ?? null,
        attempt_id: attemptObjectId,
        attemptId: attemptObjectId ? String(attemptObjectId) : null,
      },
    });
  } catch (error) {
    console.error("Error logging learning activity completion:", error);
  }
}
