import { DictationAttempt, IDictationAttempt } from "../models";
import { updateDictationPlanService } from "./dictation_plan.service";
import { SubmissionType } from "../models/enums/SubmissionType";

export const createDictationAttempt = async (data: Partial<IDictationAttempt>[], userId: string, dictationId: string) => {
    const attempts = data.map(item => new DictationAttempt({
        ...item,
        user_id: userId,
        dictation_id: dictationId,
        submit_type: SubmissionType.PRACTICE,
    }));
    const created = await DictationAttempt.insertMany(attempts);
    if (!created) {
        throw new Error("Failed to create dictation attempts");
    }

    try {
        await updateDictationPlanService(created[0].dictation_id.toString(), userId);
    } catch (err) {
        console.error("Failed to update dictation plan after attempt", err);
    }

    return created;
}
