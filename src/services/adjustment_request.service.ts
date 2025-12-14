import {
  AdjustmentRequest,
  IAdjustmentRequest,
  AdjustmentStatus,
  AdjustmentActionType,
} from "../models/adjustment_request.model";
import { LearningPath } from "../models/learning_path.model";
import { User } from "../models/user.model";
import { WeekStudy } from "../models/week_study.model";
import { DayStudy } from "../models/day_study.model";
import { Lesson } from "../models/lesson.model";
import { Quiz } from "../models/quiz.model";
import { Dictation } from "../models/dictation.model";
import { Shadowing } from "../models/shadowing.model";
import { Test } from "../models/test.model";
import { TopicVocabulary } from "../models/topic_vocabulary.model";
import { Types } from "mongoose";
import { socketService } from "./socket.service";
import { createNotification } from "./notification.service";
import { UserActivity } from "../models/user_activity.model";

export const adjustmentRequestService = {
  createRequest: async (data: Partial<IAdjustmentRequest>) => {
    // Populate weekNumber, dayNumber, weekTitle, dayTitle cho mỗi change
    if (data.changes && data.changes.length > 0 && data.learningPathId) {
      const learningPath = await LearningPath.findById(data.learningPathId)
        .populate({
          path: "week_study_ids",
          populate: {
            path: "days",
          },
        })
        .lean();

      if (learningPath && learningPath.week_study_ids) {
        for (let i = 0; i < data.changes.length; i++) {
          const change = data.changes[i];
          if (change.dayStudyId) {
            let found = false;
            // Tìm week và day chứa dayStudyId này
            for (
              let weekIdx = 0;
              weekIdx < (learningPath.week_study_ids as any[]).length;
              weekIdx++
            ) {
              const week = (learningPath.week_study_ids as any[])[weekIdx];
              if (week.days) {
                const day = week.days.find(
                  (d: any) => String(d._id) === String(change.dayStudyId)
                );
                if (day) {
                  change.weekNumber = week.week_no || weekIdx + 1;
                  change.dayNumber = day.dayOfWeek || 1;
                  change.weekTitle = week.title || `Tuần ${change.weekNumber}`;
                  change.dayTitle = day.title || `Ngày ${change.dayNumber}`;
                  found = true;
                  break;
                }
              }
            }

            // Nếu không tìm thấy, gán giá trị mặc định và log cảnh báo
            if (!found) {
              console.warn(
                `⚠️ Không tìm thấy day ${change.dayStudyId} trong learning path ${data.learningPathId}`
              );
              change.weekNumber = 1;
              change.dayNumber = 1;
              change.weekTitle = "Tuần 1";
              change.dayTitle = "Ngày 1";
            }
          } else {
            // Nếu không có dayStudyId, gán giá trị mặc định
            change.weekNumber = 1;
            change.dayNumber = 1;
            change.weekTitle = "Tuần 1";
            change.dayTitle = "Ngày 1";
          }
        }
      } else {
        // Nếu không load được learning path, gán giá trị mặc định cho tất cả
        console.warn(
          `⚠️ Không load được learning path ${data.learningPathId} để populate week/day info`
        );
        for (let change of data.changes) {
          change.weekNumber = 1;
          change.dayNumber = 1;
          change.weekTitle = "Tuần 1";
          change.dayTitle = "Ngày 1";
        }
      }
    }

    // Resolve lessonTitle / oldLessonTitle from referenced IDs when missing or placeholder
    async function resolveTitleByKind(kind: string | undefined, id: any) {
      if (!id) return null;
      try {
        if (kind === "lesson") {
          const r = await Lesson.findById(id).select("title").lean();
          return r?.title || null;
        }
        if (kind === "quiz") {
          const r = await Quiz.findById(id).select("title").lean();
          return r?.title || null;
        }
        if (kind === "dictation") {
          const r = await Dictation.findById(id).select("title").lean();
          return r?.title || null;
        }
        if (kind === "shadowing") {
          const r = await Shadowing.findById(id).select("title").lean();
          return r?.title || null;
        }
        if (kind === "mini_test") {
          const r = await Test.findById(id).select("title").lean();
          return r?.title || null;
        }
        if (kind === "flashcard") {
          const r = await TopicVocabulary.findById(id).select("title").lean();
          return r?.title || null;
        }

        // If kind is not provided or unknown, try common models sequentially
        const tryModels = [
          Lesson,
          Quiz,
          Dictation,
          Shadowing,
          Test,
          TopicVocabulary,
        ];
        for (const M of tryModels) {
          try {
            const rr: any = await (M as any)
              .findById(id)
              .select("title")
              .lean();
            if (rr && rr.title) return rr.title;
          } catch (e) {
            // ignore
          }
        }
        return null;
      } catch (err) {
        console.warn("Error resolving title", err);
        return null;
      }
    }

    function looksLikePlaceholderTitle(t: any) {
      if (!t) return true;
      if (typeof t !== "string") return true;
      // e.g. "[6926c946]" or bare hex ids
      const s = t.trim();
      if (/^\[?[0-9a-fA-F]{6,24}\]?$/.test(s)) return true;
      return false;
    }

    if (data.changes && data.changes.length > 0) {
      for (const change of data.changes) {
        try {
          let resolvedTitle: string | null = null;
          let resolvedOldTitle: string | null = null;
          if (
            !change.lessonTitle ||
            looksLikePlaceholderTitle(change.lessonTitle)
          ) {
            resolvedTitle = await resolveTitleByKind(
              change.kind,
              change.lessonId
            );
            if (resolvedTitle) change.lessonTitle = resolvedTitle;
          } else {
            resolvedTitle = change.lessonTitle as any;
          }

          if (change.oldLessonId) {
            if (
              !change.oldLessonTitle ||
              looksLikePlaceholderTitle(change.oldLessonTitle)
            ) {
              resolvedOldTitle = await resolveTitleByKind(
                change.kind,
                change.oldLessonId
              );
              if (resolvedOldTitle) change.oldLessonTitle = resolvedOldTitle;
            } else {
              resolvedOldTitle = change.oldLessonTitle as any;
            }
          }

          // Fix note field: replace raw ids or bracketed ids with resolved titles when possible
          if (change.note && typeof change.note === "string") {
            let note = change.note;
            if (change.oldLessonId && resolvedOldTitle) {
              note = note
                .split(String(change.oldLessonId))
                .join(resolvedOldTitle);
              note = note.replace(
                new RegExp(`\\[${String(change.oldLessonId)}\\]`, "g"),
                resolvedOldTitle
              );
            }
            if (change.lessonId && resolvedTitle) {
              note = note.split(String(change.lessonId)).join(resolvedTitle);
              note = note.replace(
                new RegExp(`\\[${String(change.lessonId)}\\]`, "g"),
                resolvedTitle
              );
            }
            // Replace any bare hex id placeholders with the resolved titles if they match
            note = note.replace(/\[?([0-9a-fA-F]{6,24})\]?/g, (m, g1) => {
              if (
                change.oldLessonId &&
                String(change.oldLessonId) === g1 &&
                resolvedOldTitle
              )
                return resolvedOldTitle;
              if (
                change.lessonId &&
                String(change.lessonId) === g1 &&
                resolvedTitle
              )
                return resolvedTitle;
              return m;
            });
            change.note = note;
          }
        } catch (e) {
          console.warn("Could not resolve change titles", e);
        }
      }
    }

    const request = new AdjustmentRequest(data);
    await request.save();

    const requestIdStr = String((request as any)?._id);

    // Tạo notification trong DB — lưu metadata để liên kết với adjustment request
    const notification = await createNotification({
      senderId: String(data.collaboratorId),
      recipientId: String(data.studentId),
      message: "Bạn có yêu cầu điều chỉnh lộ trình học",
      description: `CTV đã gửi yêu cầu điều chỉnh lộ trình học của bạn. Hãy xem xét và phản hồi.`,
      type: "system",
      metadata: { adjustmentRequestId: requestIdStr },
    });

    // Gửi notification qua socket để hiển thị real-time
    socketService.notifyStudent(String(data.studentId), "receiveNotification", {
      id: String((notification as any)._id),
      senderId: String(data.collaboratorId),
      recipientId: String(data.studentId),
      message: "Bạn có yêu cầu điều chỉnh lộ trình học",
      description: `CTV đã gửi yêu cầu điều chỉnh lộ trình học của bạn. Hãy xem xét và phản hồi.`,
      type: "system",
      isRead: false,
      createdAt: new Date().toISOString(),
      // Thêm metadata để frontend biết đây là adjustment request
      metadata: { adjustmentRequestId: requestIdStr },
    });

    console.log(
      `📤 Sent adjustment notification to student ${data.studentId}, requestId: ${requestIdStr}`
    );

    // Log activity cho học viên
    await UserActivity.create({
      user_id: data.studentId,
      type: "ADJUSTMENT_REQUEST_CREATED",
      title: "Yêu cầu điều chỉnh lộ trình",
      description: data.reason || "CTV đã đề xuất điều chỉnh lộ trình học",
      related_id: request._id,
      metadata: {
        collaboratorId: data.collaboratorId,
        changesCount: data.changes?.length || 0,
        changes: data.changes,
      },
    });

    return request;
  },

  getRequestsByStudent: async (studentId: string) => {
    return await AdjustmentRequest.find({ studentId })
      .populate("collaboratorId", "fullName avatar email")
      .sort({ createdAt: -1 });
  },

  getRequestsByCollaborator: async (collaboratorId: string) => {
    return await AdjustmentRequest.find({ collaboratorId })
      .populate("studentId", "fullName avatar email")
      .sort({ createdAt: -1 });
  },

  getRequestsByStudentId: async (studentId: string) => {
    return await AdjustmentRequest.find({ studentId })
      .populate("collaboratorId", "fullName avatar email")
      .sort({ createdAt: -1 });
  },

  getRequestById: async (id: string) => {
    return await AdjustmentRequest.findById(id)
      .populate("studentId", "fullName avatar")
      .populate("collaboratorId", "fullName avatar");
  },

  respondToRequest: async (
    requestId: string,
    studentId: string,
    status: AdjustmentStatus,
    rejectionReason?: string
  ) => {
    const request = await AdjustmentRequest.findById(requestId);
    if (!request) throw new Error("Yêu cầu không tồn tại");
    if (request.studentId.toString() !== studentId.toString()) {
      throw new Error("Bạn không có quyền phản hồi yêu cầu này");
    }
    if (request.status !== AdjustmentStatus.PENDING) {
      throw new Error("Yêu cầu đã được xử lý trước đó");
    }

    request.status = status;
    if (status === AdjustmentStatus.REJECTED) {
      request.rejectionReason = rejectionReason;
    } else if (status === AdjustmentStatus.APPROVED) {
      // Áp dụng thay đổi vào Learning Path
      await applyChangesToLearningPath(request);
    }

    await request.save();

    // Tạo notification cho CTV để thông báo học viên đã phản hồi
    const isApproved = status === AdjustmentStatus.APPROVED;
    const notificationMessage = isApproved
      ? "Học viên đã đồng ý yêu cầu điều chỉnh lộ trình"
      : "Học viên đã từ chối yêu cầu điều chỉnh lộ trình";
    const notificationDesc = rejectionReason
      ? `Lý do từ chối: ${rejectionReason}`
      : isApproved
      ? "Các thay đổi đã được áp dụng vào lộ trình học."
      : "Học viên không đồng ý với các thay đổi đề xuất.";

    const ctvNotification = await createNotification({
      senderId: String(request.studentId),
      recipientId: String(request.collaboratorId),
      message: notificationMessage,
      description: notificationDesc,
      type: "system",
      metadata: {
        adjustmentRequestId: String(request._id),
        responseStatus: status,
        responseReason: rejectionReason || "",
      },
    });

    // Gửi notification qua socket
    socketService.notifyCollaborator(
      String(request.collaboratorId),
      "receiveNotification",
      {
        id: String((ctvNotification as any)._id),
        senderId: String(request.studentId),
        recipientId: String(request.collaboratorId),
        message: notificationMessage,
        description: notificationDesc,
        type: "system",
        isRead: false,
        createdAt: new Date().toISOString(),
        metadata: {
          adjustmentRequestId: String(request._id),
          responseStatus: status,
          responseReason: rejectionReason || "",
        },
      }
    );

    console.log(
      `📤 Sent adjustment response notification to CTV ${request.collaboratorId}, status: ${status}`
    );

    // Log activity cho học viên
    const activityType =
      status === AdjustmentStatus.APPROVED
        ? "ADJUSTMENT_REQUEST_APPROVED"
        : "ADJUSTMENT_REQUEST_REJECTED";
    const activityTitle =
      status === AdjustmentStatus.APPROVED
        ? "Đã đồng ý điều chỉnh lộ trình"
        : "Đã từ chối điều chỉnh lộ trình";
    const activityDesc = rejectionReason
      ? `Lý do: ${rejectionReason}`
      : status === AdjustmentStatus.APPROVED
      ? "Các thay đổi đã được áp dụng"
      : "Không đồng ý với các thay đổi đề xuất";

    await UserActivity.create({
      user_id: request.studentId,
      type: activityType,
      title: activityTitle,
      description: activityDesc,
      related_id: request._id,
      metadata: {
        collaboratorId: request.collaboratorId,
        status: status,
        rejectionReason: rejectionReason,
        changesApplied: request.changes,
      },
    });

    return request;
  },

  getFullLearningPathForStudent: async (studentId: string) => {
    // Logic lấy full timeline: LearningPath -> WeekStudy -> DayStudy -> sessions
    const lp = await LearningPath.findOne({
      user_id: studentId,
      isActive: true,
    })
      .populate({
        path: "week_study_ids",
        populate: {
          path: "days",
          populate: [
            {
              path: "sessions.items.activity_id",
              select: "title type duration part_type",
            },
          ],
        },
      })
      .lean();

    if (!lp) throw new Error("Học viên chưa có lộ trình học");

    // Debug log để xem cấu trúc dữ liệu
    console.log(
      "Learning Path Structure:",
      JSON.stringify(lp, null, 2).substring(0, 1000)
    );

    return lp;
  },
};

// Hàm helper để áp dụng thay đổi (Core Logic)
async function applyChangesToLearningPath(request: IAdjustmentRequest) {
  // Duyệt qua từng change và thực hiện update DB
  for (const change of request.changes) {
    if (change.action === AdjustmentActionType.REMOVE) {
      // Xóa session item có activity_id tương ứng
      if (change.dayStudyId && change.lessonId) {
        const day = await DayStudy.findById(change.dayStudyId);
        if (!day) continue;

        const lessonIdStr = change.lessonId.toString();
        // Tìm và xóa item trong sessions
        for (const session of day.sessions) {
          session.items = session.items.filter(
            (item) => item.activity_id?.toString() !== lessonIdStr
          );
        }
        // Xóa sessions rỗng
        day.sessions = day.sessions.filter((s) => s.items.length > 0);
        await day.save();
      }
    } else if (change.action === AdjustmentActionType.ADD) {
      // Thêm lesson vào DayStudy
      if (change.dayStudyId && change.lessonId) {
        const day = await DayStudy.findById(change.dayStudyId);
        if (!day) continue;

        // Lấy session_no lớn nhất
        const maxSessionNo =
          day.sessions.length > 0
            ? Math.max(...day.sessions.map((s) => s.session_no))
            : 0;

        const newSession = {
          session_no: maxSessionNo + 1,
          accuracy: 0,
          status: "lock" as any,
          part_type: null,
          items: [
            {
              kind: "lesson" as any,
              activity_id: new Types.ObjectId(change.lessonId),
              status: "lock" as any,
            },
          ],
        };
        day.sessions.push(newSession);
        await day.save();
      }
    } else if (change.action === AdjustmentActionType.REPLACE) {
      // Thay thế: Tìm và replace activity_id
      if (change.dayStudyId && change.lessonId && change.oldLessonId) {
        const day = await DayStudy.findById(change.dayStudyId);
        if (!day) continue;

        // Tìm item có oldLessonId và thay bằng lessonId mới
        for (const session of day.sessions) {
          for (const item of session.items) {
            if (
              item.activity_id?.toString() === change.oldLessonId.toString()
            ) {
              item.activity_id = new Types.ObjectId(change.lessonId);
            }
          }
        }
        await day.save();
      }
    }
    // Reschedule có thể implement sau nếu cần
  }
}
