import { IShadowing, Shadowing } from "../models/shadowing.model";

export const getAllShadowingService = async (page: number, limit: number) => {
    const skip = (page - 1) * limit;

    const total = await Shadowing.countDocuments();

    const shadowings = await Shadowing.find()
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 })

    return {
        items: shadowings,
        total,
        page,
        pageCount: Math.ceil(total / limit)
    }
}

export const createShadowingService = async (payload: IShadowing) => {
    const data = new Shadowing(payload);
    const shadowing = await data.save();
    return shadowing;
}

export const updateShadowingService = async (payload: Partial<IShadowing>, shadowingId: string) => {
    const updated = await Shadowing.findByIdAndUpdate(shadowingId, payload, {
        new: true, // trả về document mới sau khi update
        runValidators: true, // đảm bảo validation schema được áp dụng
    });

    return updated;
}

export const deleteShadowingService = async(shadowingId: string) => {
    const deleted = await Shadowing.findByIdAndDelete(shadowingId);
    return deleted;
}