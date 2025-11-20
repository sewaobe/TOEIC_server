import {
  VocabularyWord,
  IVocabularyWord,
} from "../models/vocabulary_word.model";
import { Types } from "mongoose";

// Create vocabulary word
export const createVocabularyWordService = async (
  data: Partial<IVocabularyWord>
) => {
  const vocabularyWord = new VocabularyWord(data);
  return await vocabularyWord.save();
};

// Get all vocabulary words with pagination
export const getAllVocabularyWordsService = async (
  page = 1,
  limit = 10,
  filters?: { search?: string; level?: string }
) => {
  const query: any = {};

  if (filters?.search) {
    query.$or = [
      { word: { $regex: filters.search, $options: "i" } },
      { definition_vi: { $regex: filters.search, $options: "i" } },
      { definition_en: { $regex: filters.search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    VocabularyWord.find(query).skip(skip).limit(limit).sort({ created_at: -1 }),
    VocabularyWord.countDocuments(query),
  ]);

  return {
    items,
    total,
    page,
    limit,
    pageCount: Math.ceil(total / limit),
  };
};

// Get vocabulary word by ID
export const getVocabularyWordByIdService = async (id: string) => {
  return await VocabularyWord.findById(id);
};

// Update vocabulary word
export const updateVocabularyWordService = async (
  id: string,
  data: Partial<IVocabularyWord>
) => {
  return await VocabularyWord.findByIdAndUpdate(
    id,
    { ...data, updated_at: new Date() },
    { new: true }
  );
};

// Delete vocabulary word
export const deleteVocabularyWordService = async (id: string) => {
  return await VocabularyWord.findByIdAndDelete(id);
};

// Get multiple vocabulary words by IDs
export const getVocabularyWordsByIdsService = async (ids: string[]) => {
  return await VocabularyWord.find({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
  });
};
