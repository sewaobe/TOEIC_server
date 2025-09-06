import { Types } from "mongoose";
import { Comment, IComment } from "../models";

export const getCommentsByTest = async (
  testId: string,
  page: number,
  limit: number
): Promise<{
  comments: (IComment & { replyCount: number })[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}> => {
  const skip = (page - 1) * limit;

  const total = await Comment.countDocuments({
    test_id: new Types.ObjectId(testId),
    parent_id: null,
  });

  // aggregate + lookup + project
  const comments = await Comment.aggregate([
    { $match: { test_id: new Types.ObjectId(testId), parent_id: null } },
    { $sort: { create_at: -1 } },
    { $skip: skip },
    { $limit: limit },
    // lấy số reply
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "parent_id",
        as: "replies",
      },
    },
    {
      $addFields: {
        replyCount: { $size: "$replies" },
      },
    },
    { $project: { replies: 0 } }, // bỏ mảng replies nếu không cần
  ]).exec(); // .exec() để trả về Promise

  // populate user_id nhưng dùng lean
  const commentsLean = await Comment.populate(comments, {
    path: "user_id",
    select: "username profile",
  });

  return {
    comments: commentsLean as unknown as (IComment & { replyCount: number })[],
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Tùy chọn: thêm API riêng lấy replies cho 1 comment
export const getRepliesByComment = async (
  parentId: string,
  page: number,
  limit: number
): Promise<{
  comments: (IComment & { replyCount: number })[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}> => {
  // Đếm tổng reply trực tiếp
  const total = await Comment.countDocuments({ parent_id: parentId });

  // Lấy reply theo phân trang
  const replies = await Comment.find({ parent_id: parentId })
    .populate("user_id", "username profile")
    .sort({ create_at: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean<IComment[]>();

  // Với mỗi reply, đếm số reply con của nó
  const repliesWithCount = await Promise.all(
    replies.map(async (reply) => {
      const count = await Comment.countDocuments({ parent_id: reply._id });
      return { ...reply, replyCount: count };
    })
  );

  return {
    comments: repliesWithCount as (IComment & { replyCount: number })[],
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const createComment = async (
  userId: string,
  testId: string,
  content: string,
  parentId?: string
): Promise<IComment> => {
  const newComment = new Comment({
    user_id: userId,
    test_id: testId,
    content,
    parent_id: parentId || null,
  });

  await newComment.populate("user_id", "username profile");

  return await newComment.save();
};
