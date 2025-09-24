import mongoose from "mongoose";
import { FlashCardPlan } from "../models"

export const getFlashCardByIdService = async (id: string): Promise<any> => {
    const result = await FlashCardPlan.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(id)  } },
        {
            $lookup: {
                from: "topics",
                localField: "topic_id",
                foreignField: "_id",
                as: "topic",
            },
        },
        { $unwind: "$topic" },
        {
            $lookup: {
                from: "vocabularies",
                localField: "topic.vocabularies_id",
                foreignField: "_id",
                as: "topic.vocabularies",
            },
        },
        {
            $addFields: {
                "topic.vocabularies": { $slice: ["$topic.vocabularies", 20] },
            },
        },
        {
            $project: {
                "topic.vocabularies.word": 1,
                "topic.vocabularies.definition": 1,
                "topic.vocabularies.phonetic": 1,
                _id: 0
            },
        },
    ]);
    return result;
}