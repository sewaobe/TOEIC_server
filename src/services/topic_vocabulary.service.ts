import { Types } from "mongoose";
import { FlashCardPlan, ITopicVocabulary, TopicVocabulary } from "../models";

const mapTopic = async (topic_vocabulary: any) => {
    if (!topic_vocabulary) return null;

    const learnerCount = await FlashCardPlan.countDocuments({
        topic_vocabulary_id: topic_vocabulary._id
    });

    const isNew =
        (Date.now() - new Date(topic_vocabulary.created_at).getTime()) /
        (1000 * 60 * 60 * 24) <= 7;

    return {
        id: topic_vocabulary._id.toString(),
        title: topic_vocabulary.title,
        description: topic_vocabulary.description,
        level: topic_vocabulary.level,
        wordCount: topic_vocabulary.vocabularies_id?.length || 0,
        learnerCount,
        iconName: topic_vocabulary.iconName || "Book",
        gradient: topic_vocabulary.gradient || "from-blue-500 to-cyan-500",
        bgColor: topic_vocabulary.bgColor || "#ffffff",
        new: isNew,
        createdAt: topic_vocabulary.created_at,
        updatedAt: topic_vocabulary.updated_at ?? "",
    };
};

export const getTopicByIdService = async (id: string): Promise<ITopicVocabulary[] | null> => {
    const idObject = new Types.ObjectId(id);
    const topicVocabularies: ITopicVocabulary[] | null = await TopicVocabulary.findById(idObject);
    return topicVocabularies;
}
export const getAllTopicsService = async (page = 1, limit = 6) => {
    const skip = (page - 1) * limit;

    // tổng số bản ghi
    const total = await TopicVocabulary.countDocuments();

    // query dữ liệu phân trang
    const topicVocabularies = await TopicVocabulary.find()
        .populate("vocabularies_id")
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 }); // sort mới nhất

    const mapped = await Promise.all(
        topicVocabularies.map(async (topicVocabulary) => mapTopic(topicVocabulary))
    );

    return {
        items: mapped,
        total,
        page,
        pageCount: Math.ceil(total / limit),
    };
};

export const createTopicService = async (data: any, userId: string) => {
    const newTopic = new TopicVocabulary({
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
    const updated = await TopicVocabulary.findByIdAndUpdate(
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
    const learnerCount = await FlashCardPlan.countDocuments({ topic_vocabulary_id: id });

    if (learnerCount > 0) {
        throw new Error("Không thể xóa chủ đề đã có học viên tham gia");
    }

    const deleted = await TopicVocabulary.findByIdAndDelete(id);
    if (!deleted) {
        throw new Error("Chủ đề không tồn tại hoặc đã bị xóa");
    }

    return await mapTopic(deleted);
};
