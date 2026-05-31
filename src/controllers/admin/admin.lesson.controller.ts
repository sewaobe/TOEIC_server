import { Request, Response, NextFunction } from "express";
import { LessonManager } from "../../models/lesson_manager.model";
import { Types } from "mongoose";
import { ApiResponse } from "../../utils/ApiResponse";
import { TestStatus } from "../../models/enums/TestStatus";
import { pushNotification } from "../../utils/pushNotification";
import { onlineUsers } from "../../socket";

const EDGE_NODE_SELECT =
  "_id title part_type score_band unit_type node_role target_tags status planned_completion_time weight";

const GRAPH_NODE_SELECT =
  "_id title description part_type score_band unit_type node_role target_tags status planned_completion_time weight next_unit_ids prerequisite_unit_ids auxiliary_unit_ids";

const isAdminPayload = (payload: any) => {
  if (!payload) return false;
  return payload.roleName === "admin" || payload.role === "admin";
};

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNumberFilter = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const buildLessonManagerFilter = (query: any) => {
  const filter: any = {};
  const search = query.search ?? query.query;
  const searchText = search ? String(search).trim() : "";
  const partType = parseNumberFilter(query.part_type);
  const scoreFrom = parseNumberFilter(query.score_from);
  const scoreTo = parseNumberFilter(query.score_to);

  if (searchText) filter.title = { $regex: new RegExp(searchText, "i") };
  if (query.status) filter.status = String(query.status);
  if (partType !== undefined) filter.part_type = partType;
  if (query.unit_type) filter.unit_type = String(query.unit_type);
  if (query.node_role) filter.node_role = String(query.node_role);
  if (query.target_tag) filter.target_tags = String(query.target_tag);
  if (scoreFrom !== undefined) filter["score_band.from"] = { $gte: scoreFrom };
  if (scoreTo !== undefined) filter["score_band.to"] = { $lte: scoreTo };
  if (query.creator && Types.ObjectId.isValid(String(query.creator))) {
    filter.created_by = new Types.ObjectId(String(query.creator));
  }

  return filter;
};

const normalizeListItem = (item: any) => ({
  ...item,
  rating: item.rating ?? 0,
  student_count: item.student_count ?? 0,
});

const normalizeIdArray = (value: unknown) =>
  Array.isArray(value) ? value.map((id) => String(id)) : [];

const findDuplicateId = (ids: string[]) => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
};

const toGraphNode = (lesson: any) => ({
  id: String(lesson._id),
  title: lesson.title,
  description: lesson.description || "",
  part_type: lesson.part_type,
  score_band: lesson.score_band,
  unit_type: lesson.unit_type,
  node_role: lesson.node_role,
  target_tags: lesson.target_tags || [],
  status: lesson.status,
  planned_completion_time: lesson.planned_completion_time ?? 0,
  weight: lesson.weight ?? 0,
});

const getGraphEdgesForLesson = (lesson: any) => {
  const sourceId = String(lesson._id);
  const nextEdges = normalizeIdArray(lesson.next_unit_ids).map((targetId) => ({
    id: `${sourceId}-${targetId}-next`,
    source: sourceId,
    target: targetId,
    type: "next" as const,
  }));
  const prerequisiteEdges = normalizeIdArray(lesson.prerequisite_unit_ids).map(
    (sourcePrerequisiteId) => ({
      id: `${sourcePrerequisiteId}-${sourceId}-prerequisite`,
      source: sourcePrerequisiteId,
      target: sourceId,
      type: "prerequisite" as const,
    })
  );
  const auxiliaryEdges = normalizeIdArray(lesson.auxiliary_unit_ids).map(
    (targetId) => ({
      id: `${sourceId}-${targetId}-auxiliary`,
      source: sourceId,
      target: targetId,
      type: "auxiliary" as const,
    })
  );

  return [...nextEdges, ...prerequisiteEdges, ...auxiliaryEdges];
};

export const listLessonsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 10);
    const skip = (page - 1) * limit;
    const filter = buildLessonManagerFilter(req.query);

    const [items, total] = await Promise.all([
      LessonManager.find(filter)
        .select(
          "title part_type score_band unit_type node_role target_tags status created_at created_by thumbnail description planned_completion_time weight rating student_count"
        )
        .populate({ path: "created_by", select: "_id username displayName email" })
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 })
        .lean(),
      LessonManager.countDocuments(filter),
    ]);

    const pageCount = Math.ceil(total / limit);

    return res.status(200).json({
      data: { items: items.map(normalizeListItem), total, page, limit, pageCount },
    });
  } catch (err) {
    next(err);
  }
};

export const getLessonDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const { id } = req.params;
    const lesson = await LessonManager.findById(id)
      .populate({ path: "lesson_ids" })
      .populate({ path: "topic_vocabulary_ids" })
      .populate({ path: "dictation_ids" })
      .populate({ path: "shadowing_ids" })
      .populate({ path: "quiz_ids" })
      .populate({ path: "created_by", select: "_id username displayName email" })
      .populate({ path: "next_unit_ids", select: EDGE_NODE_SELECT })
      .populate({ path: "prerequisite_unit_ids", select: EDGE_NODE_SELECT })
      .populate({ path: "auxiliary_unit_ids", select: EDGE_NODE_SELECT })
      .lean();

    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    return res.status(200).json({ data: lesson });
  } catch (err) {
    next(err);
  }
};

export const getLessonOptionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 20);
    const skip = (page - 1) * limit;
    const filter = buildLessonManagerFilter(req.query);

    if (
      req.query.exclude_id &&
      Types.ObjectId.isValid(String(req.query.exclude_id))
    ) {
      filter._id = { $ne: new Types.ObjectId(String(req.query.exclude_id)) };
    }

    const [items, total] = await Promise.all([
      LessonManager.find(filter)
        .select("_id title part_type score_band unit_type node_role target_tags status")
        .skip(skip)
        .limit(limit)
        .sort({ part_type: 1, "score_band.from": 1, title: 1 })
        .lean(),
      LessonManager.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: {
        items,
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getLessonGraphController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const filter = buildLessonManagerFilter(req.query);
    const filteredLessons = await LessonManager.find(filter)
      .select(GRAPH_NODE_SELECT)
      .lean();

    const lessonById = new Map(
      filteredLessons.map((lesson) => [String(lesson._id), lesson])
    );
    let highlightedNodeId: string | undefined;

    const highlightId = req.query.highlight_id
      ? String(req.query.highlight_id)
      : "";
    if (highlightId && Types.ObjectId.isValid(highlightId)) {
      const highlightedLesson = await LessonManager.findById(highlightId)
        .select(GRAPH_NODE_SELECT)
        .lean();

      if (highlightedLesson) {
        highlightedNodeId = String(highlightedLesson._id);
        lessonById.set(highlightedNodeId, highlightedLesson);

        const directNeighborIds = new Set<string>();
        normalizeIdArray(highlightedLesson.next_unit_ids).forEach((id) =>
          directNeighborIds.add(id)
        );
        normalizeIdArray(highlightedLesson.prerequisite_unit_ids).forEach((id) =>
          directNeighborIds.add(id)
        );
        normalizeIdArray(highlightedLesson.auxiliary_unit_ids).forEach((id) =>
          directNeighborIds.add(id)
        );

        const inboundNeighbors = await LessonManager.find({
          $or: [
            { next_unit_ids: highlightedLesson._id },
            { prerequisite_unit_ids: highlightedLesson._id },
            { auxiliary_unit_ids: highlightedLesson._id },
          ],
        })
          .select(GRAPH_NODE_SELECT)
          .lean();
        inboundNeighbors.forEach((lesson) =>
          directNeighborIds.add(String(lesson._id))
        );

        const missingNeighborIds = Array.from(directNeighborIds).filter(
          (id) => !lessonById.has(id) && Types.ObjectId.isValid(id)
        );
        const missingNeighbors = missingNeighborIds.length
          ? await LessonManager.find({ _id: { $in: missingNeighborIds } })
              .select(GRAPH_NODE_SELECT)
              .lean()
          : [];

        [...inboundNeighbors, ...missingNeighbors].forEach((lesson) => {
          lessonById.set(String(lesson._id), lesson);
        });
      }
    }

    const lessons = Array.from(lessonById.values());
    const nodeIdSet = new Set(lessons.map((lesson) => String(lesson._id)));
    const edgeById = new Map<string, ReturnType<typeof getGraphEdgesForLesson>[number]>();

    lessons.forEach((lesson) => {
      getGraphEdgesForLesson(lesson).forEach((edge) => {
        if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
          edgeById.set(edge.id, edge);
        }
      });
    });

    return res.status(200).json({
      data: {
        nodes: lessons.map(toGraphNode),
        edges: Array.from(edgeById.values()),
        highlightedNodeId,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const updateLessonGraphController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid lesson id" });
    }

    const current = await LessonManager.findById(id)
      .select("_id part_type score_band")
      .lean();
    if (!current) return res.status(404).json({ message: "Lesson not found" });

    const edgeKeys = [
      "next_unit_ids",
      "prerequisite_unit_ids",
      "auxiliary_unit_ids",
    ] as const;
    const payloadIds = edgeKeys.reduce((acc, key) => {
      acc[key] = normalizeIdArray(req.body?.[key]);
      return acc;
    }, {} as Record<(typeof edgeKeys)[number], string[]>);

    for (const key of edgeKeys) {
      const invalidId = payloadIds[key].find((targetId) => !Types.ObjectId.isValid(targetId));
      if (invalidId) {
        return res.status(400).json({ message: `Invalid id in ${key}: ${invalidId}` });
      }

      const duplicateId = findDuplicateId(payloadIds[key]);
      if (duplicateId) {
        return res.status(400).json({ message: `Duplicate id in ${key}: ${duplicateId}` });
      }

      if (payloadIds[key].includes(String(current._id))) {
        return res.status(400).json({ message: `Self-reference is not allowed in ${key}` });
      }
    }

    const uniqueTargetIds = Array.from(
      new Set(edgeKeys.flatMap((key) => payloadIds[key]))
    );
    const targets = uniqueTargetIds.length
      ? await LessonManager.find({ _id: { $in: uniqueTargetIds } })
          .select("_id part_type score_band")
          .lean()
      : [];
    const targetById = new Map(targets.map((target) => [String(target._id), target]));

    const missingId = uniqueTargetIds.find((targetId) => !targetById.has(targetId));
    if (missingId) {
      return res.status(400).json({ message: `Target lesson not found: ${missingId}` });
    }

    for (const targetId of payloadIds.next_unit_ids) {
      const target = targetById.get(targetId);
      if (!target) continue;
      if (target.part_type !== current.part_type) {
        return res.status(400).json({ message: "Next units must have the same part_type" });
      }
      if ((target.score_band?.to ?? 0) <= (current.score_band?.to ?? 0)) {
        return res.status(400).json({
          message: "Next units must have score_band.to greater than current lesson",
        });
      }
    }

    for (const key of ["prerequisite_unit_ids", "auxiliary_unit_ids"] as const) {
      const mismatch = payloadIds[key].find((targetId) => {
        const target = targetById.get(targetId);
        return target && target.part_type !== current.part_type;
      });
      if (mismatch) {
        return res.status(400).json({ message: `${key} must have the same part_type` });
      }
    }

    const updated = await LessonManager.findByIdAndUpdate(
      id,
      {
        next_unit_ids: payloadIds.next_unit_ids.map((targetId) => new Types.ObjectId(targetId)),
        prerequisite_unit_ids: payloadIds.prerequisite_unit_ids.map(
          (targetId) => new Types.ObjectId(targetId)
        ),
        auxiliary_unit_ids: payloadIds.auxiliary_unit_ids.map(
          (targetId) => new Types.ObjectId(targetId)
        ),
      },
      { new: true }
    )
      .populate({ path: "next_unit_ids", select: EDGE_NODE_SELECT })
      .populate({ path: "prerequisite_unit_ids", select: EDGE_NODE_SELECT })
      .populate({ path: "auxiliary_unit_ids", select: EDGE_NODE_SELECT })
      .lean();

    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export const approveLessonController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

    const userId = req.user._id;
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const { id } = req.params;
    const updated = await LessonManager.findByIdAndUpdate(
      id,
      { status: TestStatus.APPROVED },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: "Lesson not found" });

    console.log("??????????", updated.created_by, onlineUsers);
    await pushNotification({
      senderId: userId,
      recipientId: updated.created_by.toString(),
      message: `✅ Bài học "${updated.title}" của bạn đã được duyệt thành công.`,
      type: "lesson",
    })
    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export const rejectLessonController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

    const userId = req.user._id;
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const { id } = req.params;
    const reason = req.body?.reason || "";
    const updated = await LessonManager.findByIdAndUpdate(
      id,
      { status: TestStatus.REJECTED },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: "Lesson not found" });

    await pushNotification({
      senderId: userId,
      recipientId: updated.created_by.toString(),
      message: `❌ Bài học "${updated.title}" của bạn đã bị từ chối.`,
      description: reason,
      type: "lesson",
    })

    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export const softDeleteLessonController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const { id } = req.params;
    const updated = await LessonManager.findByIdAndUpdate(
      id,
      { status: TestStatus.CLOSED },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: "Lesson not found" });

    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export default {};
