import { DictationAttempt, IDictationAttempt } from "../models";
import { updateDictationPlanService } from "./dictation_plan.service";

export const createDictationAttempt = async (data: Partial<IDictationAttempt>[], userId: string, dictationId: string) => {
    const attempts = data.map(item => new DictationAttempt({
        ...item,
        user_id: userId,
        dictation_id: dictationId,
    }));
    const created = await DictationAttempt.insertMany(attempts);
    if (!created) {
        throw new Error("Failed to create dictation attempts");
    }

    updateDictationPlanService(created[0].dictation_id.toString(), userId).catch(err => {
        throw err;
    });

    return created;
}