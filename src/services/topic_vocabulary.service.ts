import { Types } from "mongoose";
import { FlashCardAttempt, FlashCardPlan, ITopicVocabulary, IUser, TopicVocabulary, User } from "../models";
import { appEvents } from "../core/appEvents";
import { Role } from "../models/enums/Role";

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
        topic: topic_vocabulary.topic,
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

export const getTopicExploreService = async (page = 1, limit = 6) => {
    const skip = (page - 1) * limit;

    const total = await TopicVocabulary.countDocuments({
        $or: [
            {
                tags: { $in: ['explore'] }
            },
            {
                isCollaborator: false,
                isPublic: true,
            }
        ]
    });


    const topicVocabularies: ITopicVocabulary[] | null = await TopicVocabulary.find({
        $or: [
            {
                tags: { $in: ['explore'] }
            },
            {
                isCollaborator: false,
                isPublic: true,
            }
        ]
    })
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 });

    if (!topicVocabularies) {
        throw new Error("Không tìm thấy chủ đề nào");
    }

    const mappedTopics = await Promise.all(
        topicVocabularies.map(async (topicVocabulary) => {
            const uniqueUsers = await FlashCardAttempt.distinct("user_id", {
                topic_vocabulary_id: topicVocabulary._id,
            });

            const learnerCount = uniqueUsers.length;
            const userLearned = await User.find({
                _id: { $in: uniqueUsers }
            })
                .limit(5)
                .select("profile.avatar profile.fullname");

            const isNew =
                (Date.now() - new Date(topicVocabulary.created_at).getTime()) /
                (1000 * 60 * 60 * 24) <= 7;

            return {
                _id: topicVocabulary._id,
                title: topicVocabulary.title,
                description: topicVocabulary.description,
                tags: topicVocabulary.tags,
                level: topicVocabulary.level,
                iconName: topicVocabulary.iconName || "Book",
                gradient: topicVocabulary.gradient || "from-blue-500 to-cyan-500",
                bgColor: topicVocabulary.bgColor || "#ffffff",
                wordCount: topicVocabulary.vocabularies_id?.length || 0,
                learnerCount,
                isNew: isNew,
                userLearned: userLearned.map(user => {
                    return {
                        avatar: user?.profile?.avatar || '',
                        fullname: user?.profile?.fullname || '',
                    }
                })
            }
        })
    );

    return {
        items: mappedTopics,
        total,
        page,
        pageCount: Math.ceil(total / limit),
    };
}

/**
 * 
 * @param page 
 * @param limit 
 * @param userId
 * @param roleName
 * @returns 
 */
export const getAllTopicsService = async (page = 1, limit = 6, userId: string, roleName: Role) => {
    const skip = (page - 1) * limit;

    // tổng số bản ghi
    const total = await TopicVocabulary.countDocuments({ created_by: userId });

    // query dữ liệu phân trang
    const topicVocabularies = await TopicVocabulary.find({ created_by: userId })
        .populate("vocabularies_id")
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 }); // sort mới nhất

    if (roleName === "collaborator") {
        const mapped = await Promise.all(
            topicVocabularies.map(async (topicVocabulary) => mapTopic(topicVocabulary))
        );
        return {
            items: mapped,
            total,
            page,
            pageCount: Math.ceil(total / limit),
        };
    }

    return {
        items: topicVocabularies,
        total,
        page,
        pageCount: Math.ceil(total / limit),
    };
};

export const createTopicService = async (data: any, userId: string, roleName: Role) => {
    const newTopic = new TopicVocabulary({
        title: data.title,
        description: data.description,
        topic: data.topic || [],
        tags: data.tags || [],
        iconName: data.iconName,
        bgColor: data.bgColor,
        gradient: data.gradient,
        isPublic: data.isPublic || false,
        level: data.level,
        vocabularies_id: [],
        isCollaborator: roleName === "collaborator",
        created_by: userId,
        created_at: new Date(),
    });

    const saved = await newTopic.save();

    if (roleName === "collaborator") {
        await appEvents.emitAsync("topic.created", saved);
        const mapped = await mapTopic(saved);
        return mapped;
    }

    return saved;
}

export const updateTopicService = async (id: string, data: any, userId: string, roleName: Role) => {
    const topicVocabulary = await TopicVocabulary.findOne({ _id: id, created_by: userId });
    if (!topicVocabulary) {
        throw new Error("Chủ đề không tồn tại hoặc bạn không có quyền chỉnh sửa");
    }

    const updated = await TopicVocabulary.findByIdAndUpdate(
        id,
        {
            $set: {
                title: data.title,
                description: data.description,
                topic: data.topic,
                tags: data.tags,
                iconName: data.iconName,
                bgColor: data.bgColor,
                gradient: data.gradient,
                isPublic: data.isPublic,
                level: data.level,
                updated_at: new Date(),
            },
        },
        { new: true }
    );

    if (!updated) {
        throw new Error("Không thể cập nhật chủ đề, vui lòng thử lại");
    }

    if (roleName === "collaborator") {
        await appEvents.emitAsync("topic.updated", updated);
        const mapped = await mapTopic(updated);
        return mapped;
    }

    return updated;
}


export const deleteTopicService = async (id: string, userId: string) => {
    // Kiểm tra xem có learner nào đang học topic này không
    const learnerCount = await FlashCardPlan.countDocuments({ topic_vocabulary_id: id });

    if (learnerCount > 0) {
        throw new Error("Không thể xóa chủ đề đã có học viên tham gia");
    }

    const topicVocabulary = await TopicVocabulary.findOne({ _id: id, created_by: userId });

    if (!topicVocabulary) {
        throw new Error("Chủ đề không tồn tại hoặc bạn không có quyền xóa");
    }

    const deleted = await TopicVocabulary.findByIdAndDelete(id);
    if (!deleted) {
        throw new Error("Chủ đề không tồn tại hoặc đã bị xóa");
    }

    return await mapTopic(deleted);
};
