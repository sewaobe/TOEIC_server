// src/controllers/day_study.controller.ts
import { Request, Response } from "express";
import { getDayStudyByIdService } from "../services/day_study.service";

export const getDayStudyByIdController = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dayStudy = await getDayStudyByIdService(id);

    return res.status(200).json({
      success: true,
      data: dayStudy,
      message: "Lấy thông tin ngày học thành công",
    });
  } catch (error: any) {
    return res.status(404).json({
      success: false,
      message: error.message || "Không tìm thấy ngày học",
    });
  }
};
