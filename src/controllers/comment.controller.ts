import { Request, Response, NextFunction } from "express";
import * as commentService from "../services/comment.service";

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

    res.status(200).json({ data:{comments, pagination }});
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const createComment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { testId } = req.params;
    const { content, parentId } = req.body;

    // giả sử middleware auth đã gắn userId vào req.user.id
    const userId = req.user!._id;

    if (!content || content.trim() === "") {
      res.status(400).json({ message: "Content is required" });
      return;
    }
    console.log("testId nè:", testId);
    const comment = await commentService.createComment(
      userId,
      testId,
      content,
      parentId
    );

    res.status(201).json({ data: comment });
  } catch (err: any) {
    next(err);
  }
};
