import { IVocabularyDefinitionAttempt, VocabularyDefinitionAttempt } from "../models/vocabulary_definition_attempt.model";

export const createVocabularyDefinitionAttemptService = async (data: Partial<IVocabularyDefinitionAttempt>[], userId: string) => {
    const attemptsToCreate = data.map(item => ({
        ...item,
        user_id: userId
    }));

    const result = await VocabularyDefinitionAttempt.insertMany(attemptsToCreate);
    return result;
}

export const getVocabularyDefinitionAttemptsByUserService = async (userId: string, page = 1, limit = 10) => {
    const attempts = await VocabularyDefinitionAttempt
        .find({ user_id: userId })
        .skip((page - 1) * limit)
        .limit(limit);

    const total = await VocabularyDefinitionAttempt.countDocuments({ user_id: userId });
    const pageCount = Math.ceil(total / limit);
    return {
        items: attempts,
        total,
        page,
        pageCount
    };
}