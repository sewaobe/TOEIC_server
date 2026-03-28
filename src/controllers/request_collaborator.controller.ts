import { NextFunction, Request, Response } from "express";
import { getAllRequests, getRequestByUserId, submitRequestCollaborator, updateRequestStatus } from "../services/request_collaborator.service";
import { ApiResponse } from "../utils/ApiResponse";

export const submitRequestCollaboratorController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = req.body;
        const user_id = data.user_id;
        const result = await submitRequestCollaborator(data, user_id);
        res.status(201).json(
            ApiResponse.success(result, "Collaborator request submitted successfully.")
        );
    } catch (err) {
        next(err);
    }
}

export const getAllRequestCollaboratorsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 6;
        const result = await getAllRequests(page, limit);
        res.status(200).json(
            ApiResponse.success(result, "Fetched collaborator requests successfully.")
        );
    } catch (err) {
        next(err);
    }
}

export const getRequestCollaboratorByUserIdController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const user_id = req.user._id;
        const result = await getRequestByUserId(user_id);
        res.status(200).json(
            ApiResponse.success(result, "Fetched collaborator request successfully.")
        );
    } catch (err) {
        next(err);
    }
}

export const updateRequestCollaboratorStatusController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id;
        const { status, rejection_reason } = req.body;
        const result = await updateRequestStatus(id, status, rejection_reason);
        res.status(200).json(
            ApiResponse.success(result, "Updated collaborator request status successfully.")
        );
    } catch (err) {
        next(err);
    }
}