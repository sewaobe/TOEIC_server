import { Dictation, IDictation } from "../models/dictation.model"

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
    const data = new Dictation(payload);
    const dictation = await data.save();
    return dictation;
}

export const updateDictationService = async (payload: Partial<IDictation>, dictationId: string) => {
    const updated = await Dictation.findByIdAndUpdate(dictationId, payload, {
        new: true, // trả về document mới sau khi update
        runValidators: true, // đảm bảo validation schema được áp dụng
    });

    return updated;
}

export const deleteDictationService = async(dictationId: string) => {
    const deleted = await Dictation.findByIdAndDelete(dictationId);
    return deleted;
}