import { NextFunction, Request, Response } from "express";
import { generateIRTWeeklyPlanService } from "../services/irt.service";

export const generateIrtWeeklyPlanController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user._id;
        const { testId, answers, duration } = req.body;

        await generateIRTWeeklyPlanService(userId, testId, answers, duration);

        res.status(200).json({
            success: true,
            message: "IRT weekly plan generated successfully",
        });
    } catch (error) {
        next(error);
    }
}