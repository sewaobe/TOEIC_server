import { Types, FilterQuery } from "mongoose";
import { Question, IQuestion } from "../models";

/**
 * CREATE - thêm Question mới
 */
export const createQuestion = async (
  data: Partial<IQuestion>
): Promise<IQuestion> => {
  const question = new Question({
    ...data,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return await question.save();
};

/**
 * READ - lấy Question theo ID
 */
export const getQuestionById = async (
  id: string | Types.ObjectId
): Promise<IQuestion | null> => {
  return await Question.findById(id).exec();
};

/**
 * READ ALL - lấy danh sách Question
 */
export const getAllQuestions = async (
  filter: FilterQuery<IQuestion> = {}
): Promise<IQuestion[]> => {
  return await Question.find(filter).sort({ created_at: -1 }).exec();
};

/**
 * UPDATE - cập nhật Question theo ID
 */
export const updateQuestion = async (
  id: string | Types.ObjectId,
  data: Partial<IQuestion>
): Promise<IQuestion | null> => {
  return await Question.findByIdAndUpdate(
    id,
    { ...data, updated_at: new Date() },
    { new: true }
  ).exec();
};

/**
 * DELETE - xóa Question theo ID
 */
export const deleteQuestion = async (
  id: string | Types.ObjectId
): Promise<IQuestion | null> => {
  return await Question.findByIdAndDelete(id).exec();
};
