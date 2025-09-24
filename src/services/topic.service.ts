import { Topic } from "../models"

export const getTopicById = async(id: string) => {
    const topic = await Topic.findById(id)
    return topic;
}