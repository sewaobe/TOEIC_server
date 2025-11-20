import {
  PracticeTopicVocabulary,
  IPracticeTopicVocabulary,
} from "../models/practice_topic_vocabulary.model";
import { Types } from "mongoose";

// Create practice topic vocabulary
export const createPracticeTopicVocabularyService = async (
  data: Partial<IPracticeTopicVocabulary>,
  userId: string
) => {
  const topic = new PracticeTopicVocabulary({
    ...data,
    created_by: userId,
  });
  return await topic.save();
};

// Get all practice topic vocabularies with pagination
export const getAllPracticeTopicVocabulariesService = async (
  page = 1,
  limit = 10,
  filters?: { search?: string; level?: string; createdBy?: string }
) => {
  const query: any = {};

  if (filters?.search) {
    query.$or = [
      { title: { $regex: filters.search, $options: "i" } },
      { description: { $regex: filters.search, $options: "i" } },
      { tags: { $in: [new RegExp(filters.search, "i")] } },
    ];
  }

  if (filters?.level) {
    query.level = filters.level;
  }

  if (filters?.createdBy) {
    query.created_by = new Types.ObjectId(filters.createdBy);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    PracticeTopicVocabulary.find(query)
      .populate("vocabulary_words")
      .populate("created_by", "firstName lastName email")
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 }),
    PracticeTopicVocabulary.countDocuments(query),
  ]);

  return {
    items,
    total,
    page,
    limit,
    pageCount: Math.ceil(total / limit),
  };
};

// Get practice topic vocabulary by ID
export const getPracticeTopicVocabularyByIdService = async (id: string) => {
  return await PracticeTopicVocabulary.findById(id)
    .populate("vocabulary_words")
    .populate("created_by", "firstName lastName email");
};

// Update practice topic vocabulary
export const updatePracticeTopicVocabularyService = async (
  id: string,
  data: Partial<IPracticeTopicVocabulary>
) => {
  return await PracticeTopicVocabulary.findByIdAndUpdate(
    id,
    { ...data, updated_at: new Date() },
    { new: true }
  ).populate("vocabulary_words");
};

// Delete practice topic vocabulary
export const deletePracticeTopicVocabularyService = async (id: string) => {
  return await PracticeTopicVocabulary.findByIdAndDelete(id);
};

// Add vocabulary word to topic
export const addVocabularyWordToTopicService = async (
  topicId: string,
  vocabularyWordId: string
) => {
  return await PracticeTopicVocabulary.findByIdAndUpdate(
    topicId,
    {
      $addToSet: { vocabulary_words: new Types.ObjectId(vocabularyWordId) },
      updated_at: new Date(),
    },
    { new: true }
  ).populate("vocabulary_words");
};

// Remove vocabulary word from topic
export const removeVocabularyWordFromTopicService = async (
  topicId: string,
  vocabularyWordId: string
) => {
  return await PracticeTopicVocabulary.findByIdAndUpdate(
    topicId,
    {
      $pull: { vocabulary_words: new Types.ObjectId(vocabularyWordId) },
      updated_at: new Date(),
    },
    { new: true }
  ).populate("vocabulary_words");
};
