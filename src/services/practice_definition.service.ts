import { PracticeTopicVocabulary } from "../models/practice_topic_vocabulary.model";
import { VocabularyWord } from "../models/vocabulary_word.model";
import { Types } from "mongoose";

/**
 * Lấy danh sách topics từ PracticeTopicVocabulary
 */
export const getAllPracticeDefinitionTopicsService = async (
  page = 1,
  limit = 20,
  filters?: {
    level?: string;
    search?: string;
    created_by?: string;
  }
) => {
  const skip = (page - 1) * limit;
  const query: any = {};

  if (filters?.level) {
    query.level = filters.level;
  }

  if (filters?.search) {
    query.title = { $regex: filters.search, $options: "i" };
  }

  if (filters?.created_by) {
    query.created_by = new Types.ObjectId(filters.created_by);
  }

  const [topics, total] = await Promise.all([
    PracticeTopicVocabulary.find(query)
      .select(
        "title description level tags vocabulary_words created_by created_at"
      )
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 })
      .lean(),
    PracticeTopicVocabulary.countDocuments(query),
  ]);

  // Thêm vocabulary_count cho mỗi topic
  const topicsWithCount = topics.map((topic) => ({
    ...topic,
    vocabulary_count: Array.isArray(topic.vocabulary_words)
      ? topic.vocabulary_words.length
      : 0,
  }));

  const pageCount = Math.ceil(total / limit);

  return {
    items: topicsWithCount,
    total,
    page,
    pageCount,
  };
};

/**
 * Lấy chi tiết 1 topic
 */
export const getPracticeDefinitionTopicByIdService = async (
  topicId: string
) => {
  const topic = await PracticeTopicVocabulary.findById(topicId)
    .populate("vocabulary_words")
    .lean();

  return topic;
};

/**
 * Lấy danh sách vocabulary words của 1 topic (có phân trang)
 */
export const getVocabularyWordsByTopicService = async (
  topicId: string,
  page = 1,
  limit = 20
) => {
  const skip = (page - 1) * limit;

  // Lấy topic để có danh sách vocabulary_words IDs
  const topic = await PracticeTopicVocabulary.findById(topicId)
    .select("vocabulary_words")
    .lean();

  if (!topic) {
    throw new Error("Topic not found");
  }

  const wordIds = topic.vocabulary_words || [];
  const total = wordIds.length;

  // Lấy words theo IDs với phân trang
  const paginatedIds = wordIds.slice(skip, skip + limit);
  const words = await VocabularyWord.find({
    _id: { $in: paginatedIds },
  }).lean();

  const pageCount = Math.ceil(total / limit);

  return {
    items: words,
    total,
    page,
    pageCount,
  };
};

/**
 * Lấy random vocabulary words từ topic (để luyện tập)
 */
export const getRandomVocabularyWordsService = async (
  topicId: string,
  count = 10
) => {
  const topic = await PracticeTopicVocabulary.findById(topicId)
    .select("vocabulary_words")
    .lean();

  if (!topic) {
    throw new Error("Topic not found");
  }

  const wordIds = topic.vocabulary_words || [];

  // Shuffle và lấy count items
  const shuffled = [...wordIds].sort(() => 0.5 - Math.random());
  const selectedIds = shuffled.slice(0, Math.min(count, wordIds.length));

  const words = await VocabularyWord.find({
    _id: { $in: selectedIds },
  }).lean();

  return words;
};
