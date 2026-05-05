import policyJson from "../docs/ssp_mmc_policy.json";

type PolicyEntry = {
  halfLife: number;
  interval: number;
};

type SspMmcPolicy = {
  unit: "days";
  source?: string;
  difficultyMin: number;
  difficultyMax: number;
  policies: Record<string, PolicyEntry[]>;
};

const policy = policyJson as SspMmcPolicy;

export function lookupSspMmcIntervalDays(
  difficulty: number,
  halfLifeDays: number
): number {
  if (!Number.isFinite(difficulty)) {
    throw new Error("Invalid difficulty");
  }

  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) {
    throw new Error("Invalid halfLifeDays");
  }

  const d = clampDifficultyForPolicy(difficulty);
  const entries = policy.policies[String(d)];

  if (!entries || entries.length === 0) {
    throw new Error(`Missing SSP-MMC policy for difficulty ${d}`);
  }

  const bucketIndex = findHalfLifeBucketIndex(entries, halfLifeDays);
  const validIndex = findNearestValidIntervalIndex(entries, bucketIndex);

  if (validIndex === -1) {
    throw new Error(`No valid interval found for difficulty ${d}`);
  }

  return entries[validIndex].interval;
}

function clampDifficultyForPolicy(difficulty: number): number {
  return Math.max(
    policy.difficultyMin,
    Math.min(policy.difficultyMax, Math.round(difficulty))
  );
}

function findHalfLifeBucketIndex(
  entries: PolicyEntry[],
  halfLifeDays: number
): number {
  if (halfLifeDays <= entries[0].halfLife) {
    return 0;
  }

  if (halfLifeDays >= entries[entries.length - 1].halfLife) {
    return entries.length - 1;
  }

  let left = 0;
  let right = entries.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const midHalfLife = entries[mid].halfLife;

    if (midHalfLife === halfLifeDays) {
      return mid;
    }

    if (midHalfLife < halfLifeDays) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return Math.max(0, right);
}

function findNearestValidIntervalIndex(
  entries: PolicyEntry[],
  startIndex: number
): number {
  // If the selected bucket has interval > 0, use it.
  if (entries[startIndex]?.interval > 0) {
    return startIndex;
  }

  // interval = 0 means terminal/mastered bucket.
  // Walk backward to find nearest valid interval.
  for (let i = startIndex - 1; i >= 0; i--) {
    if (entries[i].interval > 0) {
      return i;
    }
  }

  // Defensive fallback: search forward.
  for (let i = startIndex + 1; i < entries.length; i++) {
    if (entries[i].interval > 0) {
      return i;
    }
  }

  return -1;
}

// console.log(lookupSspMmcIntervalDays(9, 1));
// console.log(lookupSspMmcIntervalDays(9, 10));
// console.log(lookupSspMmcIntervalDays(9, 100));
// console.log(lookupSspMmcIntervalDays(18, 366));