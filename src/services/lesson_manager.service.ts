import { LessonManager } from "../models/lesson_manager.model";

export const getAllTopicTitlesService = async () => {
    const topics = await LessonManager.find({}, "title").exec();
    return topics.map(topic => ({ id: topic._id, title: topic.title }));
}