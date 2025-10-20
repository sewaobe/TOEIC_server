import { Types } from "mongoose";
import { Dictation, IDictation } from "../models/dictation.model"
import { appEvents } from "../core/appEvents";

export const getAllDictationService = async (page: number, limit: number) => {
    const skip = (page - 1) * limit;

    const total = await Dictation.countDocuments();

    const dictations = await Dictation.find()
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 })

    return {
        items: dictations,
        total,
        page,
        pageCount: Math.ceil(total / limit)
    }
}

export const createDictationService = async (payload: IDictation) => {
    // Tạo mới dictation
    const dictation = (await new Dictation(payload).save()) as IDictation & {
        _id: Types.ObjectId;
    };

    if (!dictation) {
        throw new Error("Failed to create dictation");
    }

    await appEvents.emitAsync("dictation.created", dictation);

    return dictation;
};


export const updateDictationService = async (payload: Partial<IDictation>, dictationId: string) => {
    const updated = await Dictation.findByIdAndUpdate(dictationId, payload, {
        new: true, // trả về document mới sau khi update
        runValidators: true, // đảm bảo validation schema được áp dụng
    });

    if (!updated) {
        throw new Error("Dictation not found or update failed");
    }

    await appEvents.emitAsync("dictation.updated", updated);

    return updated;
}

export const deleteDictationService = async (dictationId: string) => {
    const deleted = await Dictation.findByIdAndDelete(dictationId);
    return deleted;
}