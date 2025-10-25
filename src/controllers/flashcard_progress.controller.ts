import { NextFunction, Request, Response } from "express";
import { createFlashcardSessionService, finalizeFlashcardSessionService, getAllSessionActiveByUserService, getSession, removeFlashcardSessionService, updateFlashcardProgressService } from "../services/flashcard_progress.service";
import { ApiResponse } from "../utils/ApiResponse";

export const createSessionFlashcardController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const { topic_vocabulary_id, order_queue } = req.body;

        const { sessionId, newSession } = await createFlashcardSessionService(
            userId,
            topic_vocabulary_id,
            order_queue
        );

        res.status(201).json(
            ApiResponse.success({
                sessionId,
                session: newSession,
            }, "Flashcard session created successfully")
        );
    } catch (err) {
        next(err);
    }
}

export const updateSessionFlashcardController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const { session_id, order_queue, current_index, logs_delta } = req.body;

        const updatedProgress = await updateFlashcardProgressService(
            session_id,
            userId,
            order_queue,
            current_index,
            logs_delta
        );

        res.status(200).json(
            ApiResponse.success({
                progress: updatedProgress,
            }, "Flashcard progress updated successfully")
        );
    }
    catch (err) {
        next(err);
    }
}

export const getFlashcardProgressController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const { session_id } = req.params;

        const progress = await getSession(session_id, userId);

        res.status(200).json(
            ApiResponse.success({
                progress,
            }, "Flashcard progress retrieved successfully")
        );
    } catch (err) {
        next(err);
    }
}

export const getAllActiveSessionsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 9;

        const activeSessions = await getAllSessionActiveByUserService(userId, page, limit);

        res.status(200).json(
            ApiResponse.success(
                activeSessions,
                "Active flashcard sessions retrieved successfully"
            )
        );
    }
    catch (err) {
        next(err);
    }
}

export const finalizeFlashcardSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const { session_id, accuracy, avg_time, total, logs, started_at, finished_at } = req.body;

        const finalizedSession = await finalizeFlashcardSessionService(
            userId,
            session_id,
            accuracy,
            avg_time,
            total,
            logs,
            started_at,
            finished_at
        );

        res.status(200).json(
            ApiResponse.success({
                finalizedSession,
            }, "Flashcard session finalized successfully")
        );
    } catch (err) {
        next(err);
    }
}

export const removeFlashcardSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const { session_id } = req.params;

        const removedSession = await removeFlashcardSessionService(session_id, userId);

        res.status(200).json(
            ApiResponse.success({
                removedSession,
            }, "Flashcard session removed successfully")
        );
    } catch (err) {
        next(err);
    }
}