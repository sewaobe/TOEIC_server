import { NextFunction, Request, Response } from "express";
import * as testService from "../services/test.service";

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
      const partData = await testService.getPart(testId, part as string);
      if (!partData) return res.status(404).json({ message: "Part not found" });
      return res.status(200).json({ data: partData });
    }

    if (parts) {
      const partsArray = (parts as string).split(",");
      const selectedParts = await testService.getParts(testId, partsArray);
      return res.status(200).json({ data: selectedParts });
    }

    // Mặc định trả metadata
    const test = await testService.getFullTest(testId);
    if (!test) return res.status(404).json({ message: "Test not found" });
    return res.json({
      id: test._id,
      title: test.title,
      type: test.type,
      status: test.status,
      totalParts: test.questions.size,
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

export const getTestsWithScoreAndSearch = async (req: Request, res: Response) => {
  try {
    const userId = "68addc718f9d649a167e8041"; // giả lập user đã login
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

export const getLatestTests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
    const tests = await testService.getLatestTest(limit);
    if (!tests || tests.length === 0) {
      res.status(404).json({ message: "No tests found" });
      return;
    }

    res.status(200).json({ status: 'success', count: tests.length, data: tests })
  } catch (error) {
    next(error);
  }
}