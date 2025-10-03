import { Types } from "mongoose";
import { FlashCardPlan, ITopic, Topic } from "../models"

const mapTopic = async (topic: any) => {
    if (!topic) return null;

    const learnerCount = await FlashCardPlan.countDocuments({
        topic_id: topic._id
    });

    const isNew =
        (Date.now() - new Date(topic.created_at).getTime()) /
            (1000 * 60 * 60 * 24) <= 7;

    return {
        id: topic._id.toString(),
        title: topic.title,
        description: topic.description,
        level: topic.level,
        wordCount: topic.vocabularies_id?.length || 0,
        learnerCount,
        iconName: topic.iconName || "Book",
        gradient: topic.gradient || "from-blue-500 to-cyan-500",
        bgColor: topic.bgColor || "#ffffff",
        new: isNew,
        createdAt: topic.created_at,
        updatedAt: topic.updated_at ?? "",
    };
};

export const getTopicByIdService = async (id: string): Promise<ITopic[] | null> => {
    const idObject = new Types.ObjectId(id);
    const topic: ITopic[] | null = await Topic.findById(idObject);
    return topic;
}
export const getAllTopicsService = async (page = 1, limit = 6) => {
    const skip = (page - 1) * limit;

    // tổng số bản ghi
    const total = await Topic.countDocuments();

    // query dữ liệu phân trang
    const topics = await Topic.find()
        .populate("vocabularies_id")
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 }); // sort mới nhất

    const mapped = await Promise.all(
        topics.map(async (topic) => mapTopic(topic))
    );

    return {
        items: mapped,
        total,
        page,
        pageCount: Math.ceil(total / limit),
    };
};

export const createTopicService = async (data: any, userId: string) => {
    const newTopic = new Topic({
        title: data.title,
        description: data.description,
        tags: data.tags || [],
        iconName: data.iconName,
        bgColor: data.bgColor,
        gradient: data.gradient,
        level: data.level,
        vocabularies_id: [],
        created_by: userId,
        created_at: new Date(),
    });

    const saved = await newTopic.save();
    return await mapTopic(saved);
}

export const updateTopicService = async (id: string, data: any, userId: string) => {
    const updated = await Topic.findByIdAndUpdate(
        id,
        {
            $set: {
                title: data.title,
                description: data.description,
                tags: data.tags,
                iconName: data.iconName,
                bgColor: data.bgColor,
                gradient: data.gradient,
                level: data.level,
                updated_at: new Date(),
            },
        },
        { new: true }
    );

    return await mapTopic(updated);
}


export const deleteTopicService = async (id: string) => {
    // Kiểm tra xem có learner nào đang học topic này không
    const learnerCount = await FlashCardPlan.countDocuments({ topic_id: id });

    if (learnerCount > 0) {
        throw new Error("Không thể xóa chủ đề đã có học viên tham gia");
    }

    const deleted = await Topic.findByIdAndDelete(id);
    if (!deleted) {
        throw new Error("Chủ đề không tồn tại hoặc đã bị xóa");
    }

    return await mapTopic(deleted);
};
