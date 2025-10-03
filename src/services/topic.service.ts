import { Types } from "mongoose";
import { ITopic, Topic } from "../models"

export const getTopicByIdService = async(id: string): Promise<ITopic[] | null> => {
    const idObject = new Types.ObjectId(id);
    const topic: ITopic[] | null = await Topic.findById(idObject);
    return topic;
}

export const createTopicService = async() => {

}