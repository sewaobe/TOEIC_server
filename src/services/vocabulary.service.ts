import { Types } from "mongoose";
import { FlashCardPlan, IVocabulary, Topic, Vocabulary } from "../models";

export const getVocabulariesByTopicService = async (
  topicId: string,
  page: number = 1,
  limit: number = 10
) => {
  if (!Types.ObjectId.isValid(topicId)) {
    throw new Error("Invalid topic id");
  }

  const topic = await Topic.findById(topicId);
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

export const createVocabularyService = async (vocabData: Partial<IVocabulary>, topicId?: string) => {
  const vocab = new Vocabulary(vocabData);
  const saved = await vocab.save();

  // Nếu có topicId thì gắn vocab vào topic
  if (topicId && Types.ObjectId.isValid(topicId)) {
    await Topic.findByIdAndUpdate(
      topicId,
      { $push: { vocabularies_id: saved._id } },
      { new: true }
    );
  }

  return saved;
};

export const updateVocabularyService = async (id: string, vocabData: Partial<IVocabulary>) => {
  return Vocabulary.findByIdAndUpdate(id, vocabData, { new: true });
};

export const deleteVocabularyService = async (id: string, topicId?: string) => {
  if (topicId && Types.ObjectId.isValid(topicId)) {
    await Topic.findByIdAndUpdate(
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

  const topic = await Topic.findById(topicId);
  if (!topic) {
    throw new Error("Topic not found");
  }

  // Đếm học viên (FlashCardPlan) theo topic
  const totalLearner = await FlashCardPlan.countDocuments({ topic_id: topicId });

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