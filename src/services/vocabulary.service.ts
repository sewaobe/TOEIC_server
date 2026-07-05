import { Types } from "mongoose";
import { FlashCardPlan, IVocabulary, TopicVocabulary, Vocabulary } from "../models";

function normalizeVocabularyWord(word?: string) {
  return String(word ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function withNormalizedWord(data: Partial<IVocabulary>) {
  return {
    ...data,
    ...(data.word ? { normalized_word: normalizeVocabularyWord(data.word) } : {}),
  };
}

export const getVocabulariesByTopicService = async (
  topicId: string,
  page: number = 1,
  limit: number = 10
) => {
  if (!Types.ObjectId.isValid(topicId)) {
    throw new Error("Invalid topic id");
  }

  const topic = await TopicVocabulary.findById(topicId);
  if (!topic) {
    throw new Error("Topic not found");
  }

  const skip = (page - 1) * limit;

  // Lấy vocabularies theo danh sách id có trong topic
  const vocabularies = await Vocabulary.find({
    _id: { $in: topic.vocabularies_id },
  })
    .skip(skip)
    .limit(limit);

  const total = await Vocabulary.countDocuments({
    _id: { $in: topic.vocabularies_id },
  });

  return {
    items: vocabularies,
    total,
    page,
    pageCount: Math.ceil(total / limit),
  };
};

export const createVocabularyService = async (
  vocabData: Partial<IVocabulary> | Partial<IVocabulary[]>,
  topicId?: string
) => {
  const isArray = Array.isArray(vocabData);
  const dataArray = (isArray ? vocabData : [vocabData]).filter(Boolean) as Partial<IVocabulary>[];

  const savedVocabs = await Vocabulary.insertMany(dataArray.map(withNormalizedWord));

  // Nếu có topicId thì gắn vocab vào topic
  if (topicId && Types.ObjectId.isValid(topicId)) {
    const vocabIds = savedVocabs.map((v) => v._id);
    await TopicVocabulary.findByIdAndUpdate(
      topicId,
      { $push: { vocabularies_id: { $each: vocabIds } } },
      { new: true }
    );
  }

  return isArray ? savedVocabs : savedVocabs[0];
};

export const updateVocabularyService = async (id: string, vocabData: Partial<IVocabulary>) => {
  return Vocabulary.findByIdAndUpdate(id, withNormalizedWord(vocabData), { new: true });
};

export const deleteVocabularyService = async (id: string, topicId?: string) => {
  if (topicId && Types.ObjectId.isValid(topicId)) {
    await TopicVocabulary.findByIdAndUpdate(
      topicId,
      { $pull: { vocabularies_id: id } },
      { new: true }
    );
  }
  return Vocabulary.findByIdAndDelete(id);
};

export const getTopicInfoService = async (topicId: string) => {
  if (!Types.ObjectId.isValid(topicId)) {
    throw new Error("Invalid topic id");
  }

  const topic = await TopicVocabulary.findById(topicId);
  if (!topic) {
    throw new Error("Topic not found");
  }

  // Đếm học viên (FlashCardPlan) theo topic
  const totalLearner = await FlashCardPlan.countDocuments({ topic_vocabulary_id: topicId });

  // Lấy danh sách vocabularies của topic
  const vocabularies = await Vocabulary.find({
    _id: { $in: topic.vocabularies_id },
  });

  const totalWords = vocabularies.length;

  let totalBasic = 0,
    totalIntermediate = 0,
    totalAdvance = 0;

  vocabularies.forEach((v) => {
    if (v.weight <= 0.33) totalBasic++;
    else if (v.weight <= 0.66) totalIntermediate++;
    else totalAdvance++;
  });

  return {
    name: topic.title,
    description: topic.description,
    totalLearner,
    totalWords,
    totalBasic,
    totalIntermediate,
    totalAdvance,
  };
};
