import { Vocabulary } from './../models/vocabulary';
import { NextFunction, Request, Response } from "express";
import { getFlashCardByIdService } from "../services/flashCard.service";
import { ApiResponse } from "../utils/ApiResponse";

export const getFlashCardById = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const flashCard: any = await getFlashCardByIdService(req.params.id);
        res.status(200).json(ApiResponse.success(flashCard[0]?.topic?.vocabularies, "Get flash card successfully!"));
    } catch (err) {
        next(err);
    }
}