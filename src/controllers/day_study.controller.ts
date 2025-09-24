// src/controllers/day_study.controller.ts
import { NextFunction, Request, Response } from "express";
import { getDayStudyByIdService } from "../services/day_study.service";
import { ApiResponse } from "../utils/ApiResponse";

export const getDayStudyByIdController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const dayStudy = await getDayStudyByIdService(id);

    return res.status(200).json(ApiResponse.success(dayStudy, "Lấy ngày học thành công"));
  } catch (error: any) {
    next(error);
  }
};
