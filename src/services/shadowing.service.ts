import { Types } from "mongoose";
import { IShadowing, Shadowing } from "../models/shadowing.model";
import { appEvents } from "../core/appEvents";
import { TestStatus } from "../models/enums/TestStatus";

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

export const getShadowingByIdService = async (shadowingId: string) => {
    const objectId = new Types.ObjectId(shadowingId);
    const shadowing = await Shadowing.findById(objectId)
    return shadowing;
}

export const createShadowingService = async (payload: IShadowing) => {
    // Tạo mới shadowing
    const shadowing = (await new Shadowing(payload).save()) as IShadowing & {
        _id: Types.ObjectId;
    };

    if (!shadowing) {
        throw new Error("Failed to create shadowing");
    }

    await appEvents.emitAsync("shadowing.created", shadowing);

    return shadowing;
}

export const updateShadowingService = async (payload: Partial<IShadowing>, shadowingId: string) => {
    const updated = await Shadowing.findByIdAndUpdate(shadowingId, payload, {
        new: true, // trả về document mới sau khi update
        runValidators: true, // đảm bảo validation schema được áp dụng
    });

    if (!updated) {
        throw new Error("Shadowing not found or update failed");
    }

    await appEvents.emitAsync("shadowing.updated", updated);

    return updated;
}

export const deleteShadowingService = async (shadowingId: string) => {
    const deleted = await Shadowing.findByIdAndDelete(shadowingId);
    return deleted;
}

export const getAllShadowingPracticeService = async () => {
    const shadowings = await Shadowing.find({
        status: TestStatus.APPROVED
    }).sort({ created_at: -1 });

    return shadowings;
}