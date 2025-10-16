import { Types, FilterQuery, PipelineStage } from "mongoose";
import { Question, IQuestion } from "../models";

/**
 * CREATE - thêm Question mới
 */
export const createQuestion = async (
  data: Partial<IQuestion>
): Promise<IQuestion> => {
  const question = new Question({
    ...data,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return await question.save();
};

/**
 * READ - lấy Question theo ID
 */
export const getQuestionById = async (
  id: string | Types.ObjectId
): Promise<IQuestion | null> => {
  return await Question.findById(id).exec();
};

/**
 * READ ALL - lấy danh sách Question
 */
export const getAllQuestions = async (
  filter: FilterQuery<IQuestion> = {}
): Promise<IQuestion[]> => {
  return await Question.find(filter).sort({ created_at: -1 }).exec();
};

/**
 * UPDATE - cập nhật Question theo ID
 */
export const updateQuestion = async (
  id: string | Types.ObjectId,
  data: Partial<IQuestion>
): Promise<IQuestion | null> => {
  return await Question.findByIdAndUpdate(
    id,
    { ...data, updated_at: new Date() },
    { new: true }
  ).exec();
};

/**
 * DELETE - xóa Question theo ID
 */
export const deleteQuestion = async (
  id: string | Types.ObjectId
): Promise<IQuestion | null> => {
  return await Question.findByIdAndDelete(id).exec();
};

interface GetQuestionParams {
  page?: number;
  limit?: number;
  search?: string;
  part?: number;
  tag?: string;
}

/**
 * ✅ Lấy danh sách câu hỏi (DTO) có kèm thông tin group
 */
export const getQuestionsWithGroupInfo = async ({
  page = 1,
  limit = 10,
  search = "",
  part,
  tag,
}: GetQuestionParams) => {
  const skip = (page - 1) * limit;

  // ==== 1️⃣ Tạo điều kiện lọc cho Question (layer ngoài) ====
  const query: any = {};
  if (search) query.textQuestion = { $regex: search, $options: "i" };
  if (tag) query.tags = { $in: [tag] };

  // ==== 2️⃣ Tạo pipeline ====
  const pipeline: PipelineStage[] = [
    { $match: query },

    // ---- JOIN Group ----
    {
      $lookup: {
        from: "groups",
        let: { qid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$$qid", "$questions"] },
              ...(part ? { part: Number(part) } : {}),
            },
          },
          {
            $project: {
              _id: 1,
              part: 1,
              type: 1,
              test_id: 1,
              quiz_id: 1,
              minitest_id: 1,
              practice_id: 1,
            },
          },
        ],
        as: "group",
      },
    },

    // ---- Giữ lại các câu hỏi có ít nhất 1 group match ----
    { $match: { group: { $ne: [] } } },

    // ---- Tách group đầu tiên để project thông tin ----
    { $unwind: "$group" },

    // ---- Dựng lại cấu trúc trả về ----
    {
      $project: {
        id: "$_id",
        textQuestion: 1,
        correctAnswer: 1,
        explanation: 1,
        tags: 1,
        planned_time: 1,
        created_at: 1,
        group_id: "$group._id",
        group_part: "$group.part",
        group_type: "$group.type",

        // ✅ Thêm logic canDelete
        canDelete: {
          $cond: [
            {
              $or: [
                {
                  $and: [
                    { $ifNull: ["$group.test_id", false] },
                    { $ne: ["$group.test_id", null] },
                  ],
                },
                {
                  $and: [
                    { $ifNull: ["$group.quiz_id", false] },
                    { $ne: ["$group.quiz_id", null] },
                  ],
                },
                {
                  $and: [
                    { $ifNull: ["$group.minitest_id", false] },
                    { $ne: ["$group.minitest_id", null] },
                  ],
                },
                {
                  $and: [
                    { $ifNull: ["$group.practice_id", false] },
                    { $ne: ["$group.practice_id", null] },
                  ],
                },
              ],
            },
            false,
            true,
          ],
        },

        _id: 0,
      },
    },

    { $sort: { id: -1 } },

    // ---- Phân trang ----
    { $skip: skip },
    { $limit: limit },
  ];

  // ==== 3️⃣ Chạy aggregate ====
  const items = await Question.aggregate(pipeline);

  // ==== 4️⃣ Tính tổng ====
  const countPipeline: PipelineStage[] = [
    { $match: query },
    {
      $lookup: {
        from: "groups",
        let: { qid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$$qid", "$questions"] },
              ...(part ? { part: Number(part) } : {}),
            },
          },
        ],
        as: "group",
      },
    },
    { $match: { group: { $ne: [] } } },
    { $count: "total" },
  ];

  const countResult = await Question.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;
  const pageCount = Math.ceil(total / limit);

  return { items, total, pageCount };
};
