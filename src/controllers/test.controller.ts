import { NextFunction, Request, Response } from "express";
import * as testService from "../services/test.service";
import { ITest } from "../models";
import { ApiResponse } from "../utils/ApiResponse";
// import {JwtUserPayload} from "../middlewares/verifyAccessToken.middleware"

export const getTest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { testId } = req.params;
    const { part, parts, full } = req.query;

    if (full === "true") {
      const test = await testService.getFullTest(testId);
      if (!test)
        return res.status(404).json(ApiResponse.fail("Test not found"));
      return res
        .status(200)
        .json(ApiResponse.success(test, "Lấy full test thành công"));
    }

    if (part) {
      const testWithOnePart = await testService.getPart(testId, part as string);
      if (!testWithOnePart)
        return res.status(404).json(ApiResponse.fail("Part not found"));
      return res
        .status(200)
        .json(ApiResponse.success(testWithOnePart, "Lấy 1 part thành công"));
    }

    if (parts) {
      const partsArray = (parts as string).split(",");
      const testWithSelectedParts = await testService.getParts(
        testId,
        partsArray
      );
      if (!testWithSelectedParts)
        return res.status(404).json(ApiResponse.fail("Parts not found"));
      return res
        .status(200)
        .json(ApiResponse.success(testWithSelectedParts, "Lấy nhiều part thành công"));
    }

    // Mặc định: metadata
    const test = await testService.getFullTest(testId);
    if (!test)
      return res.status(404).json(ApiResponse.fail("Test not found"));

    return res.status(200).json(
      ApiResponse.success(
        {
          _id: test._id,
          title: test.title,
          type: test.type,
          status: test.status,
          totalParts: test.questions.size,
        },
        "Lấy metadata test thành công"
      )
    );
  } catch (err) {
    next(err);
  }
};


export const submitTest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { testId } = req.params;
    const { userId, answers, duration, completedPart } = req.body;
    const result = await testService.submitTest(
      userId,
      testId,
      answers,
      duration,
      completedPart // optional
    );

    return res.status(200).json({
      message: "Test submitted successfully",
      data: result,
    });
  } catch (err: any) {
    next(err);
  }
};

export const getTestsWithScoreAndSearch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!._id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 6;
    const search = req.query.search?.toString(); // query tìm kiếm
    const { tests, totalTests, totalPages } =
      await testService.getTestsWithScoreAndSearch(userId, page, limit, search);

    res.json({
      data: { page, limit, totalPages, totalTests, tests },
    });
  } catch (err) {
    next(err);
  }
};

export const getLatestTests = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
    const tests: ITest[] = await testService.getLatestTest(limit);
    if (!tests || tests.length === 0) {
      res
        .status(200)
        .json(
          ApiResponse.success<ITest[]>(
            [],
            "Không có bài thi mới nào được tìm thấy!"
          )
        );
      return;
    }

    res.status(200).json(
      ApiResponse.success<ITest[]>(
        tests,
        `Lấy ${tests.length} bài thi mới nhất thành công!`,
        {
          count: tests.length,
        }
      )
    );
  } catch (error) {
    next(error);
  }
};

export const getTestDetail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { testId } = req.params;
    const userId = req.user?._id; // nếu có auth middleware
    const test = await testService.getTestDetail(
      testId,
      userId,
    );

    if (!test) return res.status(404).json({ message: "Test not found" });

    res.json({ data: test });
  } catch (err) {
    next(err);
  }
};

export const getAllTests = async (
  req: Request,
  res: Response,
  next: NextFunction
) : Promise<void> => {
  console.log("check")
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const { tests, total } = await testService.getAllTests(page, limit);

    res.status(200).json(
      ApiResponse.success<Partial<ITest>[]>(
        tests,
        "Lấy danh sách bài thi thành công!",
        {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        }
      )
    );
  } catch (error) {
    next(error);
  }
};
export const createTest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  console.log("create")
  try {
    const payload: Partial<ITest> = req.body;

    const newTest = await testService.createTest(payload);

    res.status(201).json(
      ApiResponse.success<ITest>(
        newTest,
        "Tạo đề thi thành công!"
      )
    );
  } catch (error) {
    next(error);
  }
};