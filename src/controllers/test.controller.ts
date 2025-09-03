import { Request, Response } from "express";
import * as testService from "../services/test.service";
import { AuthenticatedRequest } from "../middlewares/verifyAccessToken.middleware";

export const getTest = async (req: Request, res: Response) => {
  try {
    const { testId } = req.params;
    const { part, parts, full } = req.query;

    if (full === "true") {
      const test = await testService.getFullTest(testId);
      if (!test) return res.status(404).json({ message: "Test not found" });
      return res.status(200).json({ data: test });
    }

    if (part) {
      const testWithOnePart = await testService.getPart(testId, part as string);
      if (!testWithOnePart)
        return res.status(404).json({ message: "Part not found" });
      return res.status(200).json({ data: testWithOnePart });
    }

    if (parts) {
      const partsArray = (parts as string).split(",");
      const testWithSelectedParts = await testService.getParts(
        testId,
        partsArray
      );
      if (!testWithSelectedParts)
        return res.status(404).json({ message: "Parts not found" });
      return res.status(200).json({ data: testWithSelectedParts });
    }

    // Mặc định: metadata
    const test = await testService.getFullTest(testId);
    if (!test) return res.status(404).json({ message: "Test not found" });
    return res.json({
      data: {
        _id: test._id,
        title: test.title,
        type: test.type,
        status: test.status,
        totalParts: test.questions.size,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
};

export const submitTest = async (req: Request, res: Response) => {
  try {
    const { testId } = req.params;
    const userId = req.body.userId; // Hoặc lấy từ token
    const answers = req.body.answers; // [{question_id, selectedOption}, ...]

    const result = await testService.submitTest(userId, testId, answers);
    return res.status(200).json({
      message: "Test submitted successfully",
      data: result,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

export const getTestsWithScoreAndSearch = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 6;
    const search = req.query.search?.toString(); // query tìm kiếm
    const { tests, totalTests, totalPages } =
      await testService.getTestsWithScoreAndSearch(
        userId,
        page,
        limit,
        search
      );

    res.json({
      data: { page, limit, totalPages, totalTests, tests },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getTestDetail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { testId } = req.params;
    const { page = "1", limit = "5" } = req.query;
    const userId = req.user?._id; // nếu có auth middleware 
    const test = await testService.getTestDetail(
      testId,
      userId,
      parseInt(page as string),
      parseInt(limit as string)
    );

    if (!test) return res.status(404).json({ message: "Test not found" });

    res.json({ data: test });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
};