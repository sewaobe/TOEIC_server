import { NextFunction, Request, Response } from "express";
import { createNoteService, deleteNoteService, getNoteByRelatedIdService, getNotesByUserIdService, updateNoteService } from "../services/user_note.service";
import { ApiResponse } from "../utils/ApiResponse";

export const getNotesByUserIdController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const user_id = req.user._id;

        const notes = await getNotesByUserIdService(user_id);

        res.status(200).json(
            ApiResponse.success(notes, "Lấy ghi chú thành công")
        )
    } catch (err) {
        next(err);
    }
}

export const createNoteController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const user_id = req.user._id;
        const note_data = req.body;

        const newNote = await createNoteService(note_data, user_id);

        res.status(201).json(
            ApiResponse.success(newNote, "Tạo ghi chú thành công")
        )
    } catch (err) {
        next(err);
    }
}

export const updateNoteController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const user_id = req.user._id;
        const note_id = req.params.note_id;
        const note_data = req.body;

        const updatedNote = await updateNoteService(user_id, note_id, note_data);

        res.status(200).json(
            ApiResponse.success(updatedNote, "Cập nhật ghi chú thành công")
        )
    } catch (err) {
        next(err);
    }
}

export const deleteNoteController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const user_id = req.user._id;
        const note_id = req.params.note_id;

        const deletedNote = await deleteNoteService(user_id, note_id);

        res.status(200).json(
            ApiResponse.success(deletedNote, "Xóa ghi chú thành công")
        )
    } catch (err) {
        next(err);
    }
}

export const getNoteByRelatedIdController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const user_id = req.user._id;
        const related_id = req.params.related_id;
        const note = await getNoteByRelatedIdService(user_id, related_id);

        res.status(200).json(
            ApiResponse.success(note, "Lấy ghi chú theo related_id thành công")
        )
    } catch (err) {
        next(err);
    }
}   