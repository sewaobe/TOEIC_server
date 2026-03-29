import { NextFunction, Request, Response } from "express";
import * as testService from "../services/test.service";
import { ITest } from "../models";
import { ApiResponse } from "../utils/ApiResponse";
import { Types } from "mongoose";

export const getTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
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
        partsArray,
      );
      if (!testWithSelectedParts)
        return res.status(404).json(ApiResponse.fail("Parts not found"));
      return res
        .status(200)
        .json(
          ApiResponse.success(
            testWithSelectedParts,
            "Lấy nhiều part thành công",
          ),
        );
    }

    // Mặc định: metadata
    const test = await testService.getFullTest(testId);
    if (!test) return res.status(404).json(ApiResponse.fail("Test not found"));

    return res.status(200).json(
      ApiResponse.success(
        {
          _id: test._id,
          title: test.title,
          type: test.type,
          status: test.status,
          totalParts: test.questions.size,
        },
        "Lấy metadata test thành công",
      ),
    );
  } catch (err) {
    next(err);
  }
};

export const submitTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { testId } = req.params;
    const { userId, answers, duration, completedPart } = req.body;
    const result = await testService.submitTest(
      userId,
      testId,
      answers,
      duration,
      completedPart, // optional
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
  next: NextFunction,
) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(
          ApiResponse.fail(
            "Bạn không có quyền thực hiện chức năng tìm kiếm đề thi!",
          ),
        );
    }
    // const page = parseInt(req.query.page?.toString() || "1");
    // const limit = parseInt(req.query.limit?.toString() || "6");
    // const search = req.query.search?.toString().trim() || "";
    let page = 1;
    let limit = 6;
    let search = "";
    let keywords = "";
    let year = "";

    if (req.query.page) {
      const parsedPage = parseInt(req.query.page.toString(), 10);
      page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    }

    if (req.query.limit) {
      const parsedLimit = parseInt(req.query.limit.toString(), 10);
      limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 6;
    }

    if (req.query.search) {
      search = req.query.search.toString().trim();
    }

    if (req.query.keywords) {
      keywords = req.query.keywords.toString().trim();
    }

    if (req.query.year) {
      year = req.query.year.toString().trim();
    }

    const normalizedKeywords = keywords || search;

    const { tests, totalTests, totalPages } =
      await testService.getTestsWithScoreAndSearch(userId, page, limit, {
        keywords: normalizedKeywords,
        year,
      });

    res
      .status(200)
      .json(
        ApiResponse.success(
          {
            page,
            limit,
            totalPages,
            totalTests,
            tests,
            keywords: normalizedKeywords,
            year,
          },
          "Tìm kiếm đề thi thành công",
        ),
      );
  } catch (err) {
    next(err);
  }
};

export const getLatestTests = async (
  req: Request,
  res: Response,
  next: NextFunction,
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
            "Không có bài thi mới nào được tìm thấy!",
          ),
        );
      return;
    }

    res.status(200).json(
      ApiResponse.success<ITest[]>(
        tests,
        `Lấy ${tests.length} bài thi mới nhất thành công!`,
        {
          count: tests.length,
        },
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const getTestDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { testId } = req.params;
    const userId = req.user?._id; // nếu có auth middleware
    const test = await testService.getTestDetail(testId, userId);

    if (!test) return res.status(404).json({ message: "Test not found" });

    res.json({ data: test });
  } catch (err) {
    next(err);
  }
};

export const getAllTests = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const search = req.query.search ? String(req.query.search) : "";
    const status = req.query.status ? String(req.query.status) : "";
    const topic = req.query.topic ? String(req.query.topic) : "";
    const type = req.query.type ? String(req.query.type) : ""; // ✅ thêm dòng này

    // Gọi service có filter type mới
    const { items, total, pageCount } = await testService.getAllTests(
      page,
      limit,
      search,
      status,
      topic,
      type, // ✅ truyền thêm type vào
    );

    res.status(200).json(
      ApiResponse.success<{
        items: Partial<ITest>[];
        total: number;
        pageCount: number;
      }>({ items, total, pageCount }, "Lấy danh sách đề thi thành công!"),
    );
  } catch (error) {
    next(error);
  }
};

export const createTestController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const payload: Partial<ITest> = req.body;

    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
    }

    payload.created_by = new Types.ObjectId(req.user._id);

    if (!payload.title || payload.title.trim() === "") {
      return res.status(400).json(ApiResponse.fail("Thiếu tiêu đề bài thi!"));
    }

    if (!payload.topic || payload.topic.trim() === "") {
      return res.status(400).json(ApiResponse.fail("Thiếu chủ đề bài thi!"));
    }

    const newTest = await testService.createTest(payload);

    return res
      .status(201)
      .json(ApiResponse.success<ITest>(newTest, "Tạo đề thi thành công!"));
  } catch (error) {
    next(error);
  }
};

export const deleteTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { testId } = req.params;

    if (!Types.ObjectId.isValid(testId)) {
      res.status(400).json(ApiResponse.fail("ID không hợp lệ"));
      return;
    }

    const deleted = await testService.deleteTest(testId);

    if (!deleted) {
      res.status(404).json(ApiResponse.fail("Không tìm thấy đề thi"));
      return;
    }

    res.status(200).json(ApiResponse.success(null, "Xóa đề thi thành công!"));
  } catch (error) {
    next(error);
  }
};

export const updateTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { testId } = req.params;

    if (!Types.ObjectId.isValid(testId)) {
      res.status(400).json(ApiResponse.fail("ID không hợp lệ"));
      return;
    }

    const updated = await testService.updateTest(testId, req.body);
    if (!updated) {
      res.status(404).json(ApiResponse.fail("Không tìm thấy đề thi"));
      return;
    }

    res
      .status(200)
      .json(ApiResponse.success(updated, "Cập nhật đề thi thành công!"));
  } catch (err) {
    next(err);
  }
};

export const updateTestStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { testId } = req.params;
    const { status } = req.body;
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json(ApiResponse.fail("Unauthorized"));
      return;
    }
    if (!Types.ObjectId.isValid(testId)) {
      res.status(400).json(ApiResponse.fail("ID không hợp lệ"));
      return;
    }
    const updatedTest = await testService.updateStatusTest(
      testId,
      status,
      userId,
    );
    if (!updatedTest) {
      res.status(404).json(ApiResponse.fail("Không tìm thấy đề thi"));
      return;
    }

    // Gửi thông báo đến admin khi CTV/user thay đổi status
    const { pushNotificationToAdmin } =
      await import("../utils/pushNotificationToAdmin");
    pushNotificationToAdmin(userId, {
      message: `📝 Bài thi "${updatedTest.title}" đã được chuyển sang trạng thái "${status}".`,
      type: "test",
      url: `http://localhost:5174/admin/tests/${updatedTest._id}`,
    });

    res
      .status(200)
      .json(
        ApiResponse.success(
          updatedTest,
          "Cập nhật trạng thái đề thi thành công!",
        ),
      );
  } catch (err) {
    next(err);
  }
};
