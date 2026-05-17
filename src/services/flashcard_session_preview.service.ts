import mongoose, { Types } from "mongoose";
import {
    calForgetHalflife,
    calculateRecallProbability,
    calRecallHalflife,
    clampDifficulty,
    DHP_CONFIG,
} from "../utils/dhp.util";
import {
    IUserVocabularyMemoryV2,
    UserVocabularyMemoryV2,
} from "../models/user_vocabulary_progress_v2.model";
import { lookupSspMmcIntervalDays } from "./ssp_mmc_policy.service";

export const NEW_CARD_REMEMBER_INTERVAL_DAYS = 1;
export const VAGUE_DIFFICULTY_STEP = 1;
export const FORGOT_DIFFICULTY_STEP = 2;

export const SHORT_TERM_REPEAT_POLICIES = {
    vague: {
        ratio: 0.6,
        min: 2,
        max: 10,
    },
    unknown_or_forgot: {
        ratio: 0.25,
        min: 1,
        max: 5,
    },
} as const;

export type ShortTermRepeatPolicyKey = keyof typeof SHORT_TERM_REPEAT_POLICIES;
export type PreviewCardType = "NEW" | "REVIEW";

type PreviewAction = {
    difficulty?: number;
    half_life_days?: number;
    interval_days?: number;
    repeat_policy_key?: ShortTermRepeatPolicyKey;
};

export type FlashcardSessionPreviewCard = {
    card_type: PreviewCardType;
    memory_snapshot?: {
        difficulty: number;
        half_life_days: number;
        last_reviewed_at: Date | null;
        p_recall_now: number;
    };
    options: {
        remember: PreviewAction;
        vague: PreviewAction;
        unknown?: PreviewAction;
        forgot?: PreviewAction;
    };
};

export type FlashcardSessionPreviewMetadata = {
    repeat_policy: typeof SHORT_TERM_REPEAT_POLICIES;
    cards: Record<string, FlashcardSessionPreviewCard>;
};

type MemoryForPreview = Pick<
    IUserVocabularyMemoryV2,
    "vocabulary_id" | "difficulty" | "half_life_days" | "last_reviewed_at"
>;

export function buildNewCardPreview(): FlashcardSessionPreviewCard {
    return {
        card_type: "NEW",
        options: {
            remember: {
                interval_days: NEW_CARD_REMEMBER_INTERVAL_DAYS,
            },
            vague: {
                repeat_policy_key: "vague",
            },
            unknown: {
                repeat_policy_key: "unknown_or_forgot",
            },
        },
    };
}

export function buildReviewCardPreview(
    memory: MemoryForPreview,
    now: Date = new Date()
): FlashcardSessionPreviewCard {
    const currentDifficulty = clampDifficulty(memory.difficulty);
    const currentHalfLifeDays = memory.half_life_days;
    const lastReviewedAt = memory.last_reviewed_at ?? null;
    const pRecallNow = lastReviewedAt
        ? calculateRecallProbability(currentHalfLifeDays, lastReviewedAt, now)
        : DHP_CONFIG.MAX_P_RECALL;

    const rememberHalfLifeDays = calRecallHalflife(
        currentDifficulty,
        currentHalfLifeDays,
        pRecallNow
    );
    const forgotHalfLifeDays = calForgetHalflife(
        currentDifficulty,
        currentHalfLifeDays,
        pRecallNow
    );
    const vagueDifficulty = clampDifficulty(currentDifficulty + VAGUE_DIFFICULTY_STEP);
    const forgotDifficulty = clampDifficulty(currentDifficulty + FORGOT_DIFFICULTY_STEP);

    return {
        card_type: "REVIEW",
        memory_snapshot: {
            difficulty: currentDifficulty,
            half_life_days: currentHalfLifeDays,
            last_reviewed_at: lastReviewedAt,
            p_recall_now: pRecallNow,
        },
        options: {
            remember: {
                difficulty: currentDifficulty,
                half_life_days: rememberHalfLifeDays,
                interval_days: lookupSspMmcIntervalDays(
                    currentDifficulty,
                    rememberHalfLifeDays
                ),
            },
            vague: {
                difficulty: vagueDifficulty,
                half_life_days: forgotHalfLifeDays,
                interval_days: lookupSspMmcIntervalDays(vagueDifficulty, forgotHalfLifeDays),
                repeat_policy_key: "vague",
            },
            forgot: {
                difficulty: forgotDifficulty,
                half_life_days: forgotHalfLifeDays,
                interval_days: lookupSspMmcIntervalDays(forgotDifficulty, forgotHalfLifeDays),
                repeat_policy_key: "unknown_or_forgot",
            },
        },
    };
}

export async function buildFlashcardSessionPreviewMetadata(input: {
    userId: string;
    vocabularyIds: string[];
    now?: Date;
}): Promise<FlashcardSessionPreviewMetadata> {
    const { userId, vocabularyIds, now = new Date() } = input;
    const validObjectIds = vocabularyIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

    const memoryRecords =
        validObjectIds.length === 0
            ? []
            : await UserVocabularyMemoryV2.find({
                  user_id: new Types.ObjectId(userId),
                  vocabulary_id: { $in: validObjectIds },
              }).lean();

    const memoryByVocabularyId = new Map(
        (memoryRecords as MemoryForPreview[]).map((memory) => [
            memory.vocabulary_id.toString(),
            memory,
        ])
    );

    const cards: Record<string, FlashcardSessionPreviewCard> = {};
    for (const vocabularyId of vocabularyIds) {
        const memory = memoryByVocabularyId.get(vocabularyId);
        cards[vocabularyId] = memory
            ? buildReviewCardPreview(memory, now)
            : buildNewCardPreview();
    }

    return {
        repeat_policy: SHORT_TERM_REPEAT_POLICIES,
        cards,
    };
}
