import { Types, FilterQuery, PipelineStage } from "mongoose";
import { Question, IQuestion, Group } from "../models";

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
 * ✅ Lấy danh sách câu hỏi (DTO) có kèm thông tin group - OPTIMIZED
 */
export const getQuestionsWithGroupInfo = async ({
  page = 1,
  limit = 10,
  search = "",
  part,
  tag,
}: GetQuestionParams) => {
  const skip = (page - 1) * limit;

  // ==== 🚀 STRATEGY MỚI: Query từ Groups trước (ít hơn questions) ====
  const groupMatch: any = {};
  if (part) groupMatch.part = Number(part);

  const pipeline: PipelineStage[] = [
    // 1. Lọc groups theo part
    { $match: groupMatch },

    // 2. Unwind questions array để có thể filter/search
    { $unwind: "$questions" },

    // 3. Lookup question details
    {
      $lookup: {
        from: "questions",
        localField: "questions",
        foreignField: "_id",
        as: "question_data",
      },
    },
    { $unwind: "$question_data" },

    // 4. Match search/tag conditions
    ...(search || tag
      ? [
          {
            $match: {
              ...(search
                ? {
                    "question_data.textQuestion": {
                      $regex: search,
                      $options: "i",
                    },
                  }
                : {}),
              ...(tag ? { "question_data.tags": { $in: [tag] } } : {}),
            },
          } as PipelineStage,
        ]
      : []),

    // 5. Lookup media chỉ lấy URL (không cần full document)
    {
      $lookup: {
        from: "media",
        localField: "audioUrl",
        foreignField: "_id",
        pipeline: [{ $project: { url: 1, _id: 0 } }],
        as: "audio",
      },
    },
    {
      $lookup: {
        from: "media",
        localField: "imagesUrl",
        foreignField: "_id",
        pipeline: [{ $project: { url: 1, _id: 0 } }],
        as: "images",
      },
    },

    // 6. Project final structure
    {
      $project: {
        id: "$question_data._id",
        textQuestion: "$question_data.textQuestion",
        correctAnswer: "$question_data.correctAnswer",
        explanation: "$question_data.explanation",
        tags: "$question_data.tags",
        planned_time: "$question_data.planned_time",
        created_at: "$question_data.created_at",
        group_id: "$_id",
        group_part: "$part",
        group_type: "$type",
        group_audioUrl: { $arrayElemAt: ["$audio.url", 0] },
        group_imagesUrl: "$images.url",
        canDelete: {
          $cond: [
            {
              $or: [
                { $ne: ["$test_id", null] },
                { $ne: ["$quiz_id", null] },
                { $ne: ["$minitest_id", null] },
                { $ne: ["$practice_id", null] },
              ],
            },
            false,
            true,
          ],
        },
        _id: 0,
      },
    },

    // 7. Sort
    { $sort: { created_at: -1 } },

    // 8. Facet để count và paginate trong 1 query
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const result = await Group.aggregate(pipeline);

  const items = result[0]?.data || [];
  const total = result[0]?.metadata[0]?.total || 0;
  const pageCount = Math.ceil(total / limit);

  return { items, total, pageCount };
};

export const getQuestionDetailById = async (
  question_id: string,
  test_id: string
) => {
  const testObjectId = new Types.ObjectId(test_id);
  const questionObjectId = new Types.ObjectId(question_id);

  const group = await Group.findOne({
    test_id: testObjectId,
    questions: questionObjectId,
  })
    .populate([
      {
        path: "questions",
        model: "Question",
        select: "name textQuestion choices correctAnswer explanation tags",
      },
      {
        path: "audioUrl",
        model: "Media",
        select: "url -_id",
      },
      {
        path: "imagesUrl",
        model: "Media",
        select: "url -_id",
      },
    ])
    .lean()
    .exec();

  return group;
};
