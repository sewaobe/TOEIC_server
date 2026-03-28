import { Request, Response, NextFunction } from "express";
import * as commentService from "../services/comment.service";
import { ApiResponse } from "../utils/ApiResponse";

export const getCommentsByTest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { testId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    console.log("testid là:", testId);

    const { comments, pagination } = await commentService.getCommentsByTest(
      testId,
      page,
      limit
    );

    res.json({
      data: {
        comments,
        pagination, // total nằm trong pagination.total
      },
    });
  } catch (err: any) {
    next(err);
  }
};

export const getRepliesByComment = async (req: Request, res: Response) => {
  try {
    const { parentId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 5;

    const { comments, pagination } = await commentService.getRepliesByComment(
      parentId,
      page,
      limit
    );

    res.status(200).json({ data: { comments, pagination } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const createComment = async (
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

    if (!userId) {
      return res.status(401).json(
        ApiResponse.fail("Bạn không có quyền thực hiện chức năng tìm kiếm đề thi!")
      )
    }

    const { testId } = req.params;
    if (!testId || testId.length !== 24) {
      return res
        .status(404)
        .json(ApiResponse.fail("ID không hợp lệ hoặc thiếu ID trong request"));
    }

    const { content, parentId } = req.body;
    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Nội dung bình luận không được để trống" });
    } else if (content.length > 255) {
      return res.status(400).json({ message: "Nội dung bình luận không được dài hơn 255 ký tự" });
    }

    const comment = await commentService.createComment(
      userId,
      testId,
      content,
      parentId
    );

    res.status(201).json(
      ApiResponse.success(comment, "Viết bình luận thành công")
    );
  } catch (err) {
    next(err);
  }
};


export const getCommentByCreatedTestOrLessonController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

    const userId = req.user._id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const result = await commentService.getCommentByCreatedTestOrLessonService(
      userId,
      limit,
      page
    );
    res.status(200).json(
      ApiResponse.success(result, "Lấy bình luận của bài test/bài học đã tạo thành công")
    );
  } catch (error) {
    next(error);
  }
};