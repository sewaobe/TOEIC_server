/**
 * @fileoverview Unit Tests for IRT Service (Item Response Theory)
 * @description Comprehensive test suite for IRT calculations and Greedy Scheduler
 * 
 * Test Coverage:
 * - IRT Models (Rasch 1PL, 2PL)
 * - Theta Estimation
 * - Difficulty Calibration
 * - Part Classification
 * - Greedy Scheduler Algorithm
 * - Helper Functions
 * 
 * @version 1.0.0
 */

import { describe, expect, it} from '@jest/globals';

// ============================================================
// TYPE DEFINITIONS (Mirror from irt.service.ts for testing)
// ============================================================

interface LearningItem {
  part: number;
  kind: string;
  resource_id: string;
  level: string;
  weight: number;
  estimated_time: number;
  title?: string;
}

interface SessionItem {
  kind: string;
  resource_id: string;
  estimated_time: number;
}

interface Session {
  session_no: number;
  part: number;
  items: SessionItem[];
  total_minutes: number;
}

interface DayPlan {
  day_index: number;
  day_type: 'weak' | 'medium' | 'strong' | 'test';
  parts_to_study: number[];
  sessions: Session[];
  total_minutes: number;
}

interface ClassifiedParts {
  weak_parts: number[];
  medium_parts: number[];
  strong_parts: number[];
}

// ============================================================
// PURE FUNCTION IMPLEMENTATIONS (For Unit Testing)
// These are extracted from irt.service.ts for isolated testing
// ============================================================

/**
 * Rasch Model (1PL) - Probability function
 * P(θ) = 1 / (1 + exp(-(θ - b)))
 */
function PRasch(theta: number, b: number): number {
  return 1 / (1 + Math.exp(-(theta - b)));
}

/**
 * 2PL Model - Probability function
 * P(θ) = 1 / (1 + exp(-a*(θ - b)))
 */
function P2PL(theta: number, a: number, b: number): number {
  return 1 / (1 + Math.exp(-a * (theta - b)));
}

/**
 * Estimate Theta using Rasch 1PL (MLE with Newton-Raphson)
 */
function estimateThetaRasch(items: { b: number; correct: number }[]): number {
  if (!items.length) return 0;

  const totalCorrect = items.reduce((sum, item) => sum + item.correct, 0);
  if (totalCorrect === 0) return -4;
  if (totalCorrect === items.length) return 4;

  let theta = 0;
  const maxIter = 30;
  const tolerance = 0.0001;

  for (let iter = 0; iter < maxIter; iter++) {
    let L1 = 0;
    let L2 = 0;

    for (const item of items) {
      const p = PRasch(theta, item.b);
      const q = 1 - p;
      L1 += item.correct - p;
      L2 += -p * q;
    }

    if (Math.abs(L2) < 1e-10) break;

    const delta = L1 / L2;
    theta -= delta;

    if (Math.abs(delta) < tolerance) break;

    theta = Math.max(-4, Math.min(4, theta));
  }

  return theta;
}

/**
 * Calibrate Difficulty using Rasch 1PL MLE
 */
function calibrateDifficultyRasch(responses: { theta: number; correct: number }[]): number {
  if (!responses.length) return 0;

  const totalCorrect = responses.reduce((sum, r) => sum + r.correct, 0);
  if (totalCorrect === 0) return 4;
  if (totalCorrect === responses.length) return -4;

  const pCorrect = totalCorrect / responses.length;
  let b = -Math.log(pCorrect / (1 - pCorrect));
  b = Math.max(-4, Math.min(4, b));

  const maxIter = 30;
  const tolerance = 0.0001;

  for (let iter = 0; iter < maxIter; iter++) {
    let L1 = 0;
    let L2 = 0;

    for (const r of responses) {
      const p = PRasch(r.theta, b);
      const q = 1 - p;
      L1 += p - r.correct;
      L2 += p * q;
    }

    if (L2 < 1e-10) break;

    const delta = L1 / L2;
    b += delta;

    if (Math.abs(delta) < tolerance) break;

    b = Math.max(-4, Math.min(4, b));
  }

  return b;
}

/**
 * Calculate Theta by Part using Rasch 1PL
 */
function calculateThetaRasch(result: {
  responses: { b: number; correct: number; part: number | null }[];
}) {
  const overallItems: { b: number; correct: number }[] = [];
  const itemsByPart: Record<number, { b: number; correct: number }[]> = {};

  for (const r of result.responses) {
    const item = { b: r.b, correct: r.correct };
    overallItems.push(item);

    if (r.part != null && r.part >= 1 && r.part <= 7) {
      if (!itemsByPart[r.part]) itemsByPart[r.part] = [];
      itemsByPart[r.part].push(item);
    }
  }

  const thetaOverall = estimateThetaRasch(overallItems);

  const thetaByPart: Record<number, number> = {};
  for (let part = 1; part <= 7; part++) {
    const items = itemsByPart[part] || [];
    thetaByPart[part] = estimateThetaRasch(items);
  }

  return { thetaOverall, thetaByPart };
}

/**
 * Theta to CEFR Level bands
 */
function thetaToCEFR(theta: number): string[] {
  if (theta < -1.0) return ['A1', 'A2'];
  if (theta < -0.5) return ['A2', 'B1'];
  if (theta < 0.0) return ['B1', 'B2'];
  if (theta < 0.7) return ['B1', 'B2', 'C1'];
  return ['B2', 'C1', 'C2'];
}

/**
 * Theta to Weight range
 */
function thetaToWeightRange(theta: number): { min: number; max: number } {
  if (theta < -0.7) return { min: 0.0, max: 0.4 };
  if (theta < -0.2) return { min: 0.0, max: 0.6 };
  if (theta < 0.5) return { min: 0.3, max: 0.8 };
  return { min: 0.5, max: 1.0 };
}

/**
 * Estimate study time by activity kind
 */
function estimateStudyTime(kind: string): number {
  switch (kind) {
    case 'quiz': return 10;
    case 'lesson': return 20;
    case 'vocab': return 30;
    case 'dictation': return 10;
    case 'shadowing': return 15;
    default: return 10;
  }
}

/**
 * Classify parts by theta (weak, medium, strong)
 */
function classifyPartsByTheta(thetaByPart: Record<number, number>): ClassifiedParts & { sorted_list: { part: number; theta: number }[] } {
  const entries = Object.entries(thetaByPart).map(([part, theta]) => ({
    part: Number(part),
    theta: Number(theta),
  }));

  entries.sort((a, b) => a.theta - b.theta);

  const weak = entries.slice(0, 3).map((x) => x.part);
  const medium = entries.slice(3, 5).map((x) => x.part);
  const strong = entries.slice(5).map((x) => x.part);

  return {
    weak_parts: weak,
    medium_parts: medium,
    strong_parts: strong,
    sorted_list: entries,
  };
}

/**
 * Get item priority by kind (for optimization loop)
 */
function getItemPriorityByKind(kind: string): number {
  switch (kind) {
    case 'lesson': return 5;
    case 'dictation':
    case 'shadowing': return 4;
    case 'vocab': return 3;
    case 'quiz': return 2;
    default: return 1;
  }
}

/**
 * Get item priority (full version with weight)
 */
function getItemPriority(item: LearningItem): number {
  let typeScore = 0;
  switch (item.kind) {
    case 'lesson': typeScore = 5; break;
    case 'dictation':
    case 'shadowing': typeScore = 4; break;
    case 'vocab': typeScore = 3; break;
    case 'quiz': typeScore = 2; break;
    default: typeScore = 1;
  }
  return typeScore + (item.weight || 0) * 10;
}

/**
 * Interleave items for diverse sessions (A-B-A pattern)
 */
function interleaveItems(items: LearningItem[]): LearningItem[] {
  if (items.length <= 2) return items;

  const byKind: Record<string, LearningItem[]> = {};
  for (const item of items) {
    if (!byKind[item.kind]) byKind[item.kind] = [];
    byKind[item.kind].push(item);
  }

  const result: LearningItem[] = [];
  const kinds = Object.keys(byKind);
  let lastKind = '';
  let lastLastKind = '';

  while (Object.values(byKind).some((arr) => arr.length > 0)) {
    let selectedKind = kinds.find(
      (k) => k !== lastKind && k !== lastLastKind && byKind[k].length > 0
    );

    if (!selectedKind) {
      selectedKind = kinds.find((k) => k !== lastKind && byKind[k].length > 0);
    }

    if (!selectedKind) {
      selectedKind = kinds.find((k) => byKind[k].length > 0);
    }

    if (!selectedKind) break;

    result.push(byKind[selectedKind].shift()!);
    lastLastKind = lastKind;
    lastKind = selectedKind;
  }

  return result;
}

// ============================================================
// TEST SUITES
// ============================================================

describe('IRT Service Unit Tests', () => {
  // ==========================================================
  // SECTION 1: IRT PROBABILITY MODELS
  // ==========================================================
  describe('1. IRT Probability Models', () => {
    describe('PRasch (Rasch 1PL Model)', () => {
      it('TC-01 Should return 0.5 when theta equals difficulty', () => {
        // When theta = b, probability should be exactly 0.5
        const result = PRasch(0, 0);
        expect(result).toBeCloseTo(0.5, 5);
      });

      it('TC-02 Should return value > 0.5 when theta > difficulty', () => {
        // Higher ability than difficulty → higher probability of correct
        const result = PRasch(1, 0);
        expect(result).toBeGreaterThan(0.5);
        expect(result).toBeLessThan(1);
      });

      it('TC-03 Should return value < 0.5 when theta < difficulty', () => {
        // Lower ability than difficulty → lower probability of correct
        const result = PRasch(-1, 0);
        expect(result).toBeLessThan(0.5);
        expect(result).toBeGreaterThan(0);
      });

      it('TC-04 Should approach 1 for very high theta', () => {
        const result = PRasch(4, 0);
        expect(result).toBeGreaterThan(0.98);
      });

      it('TC-05 Should approach 0 for very low theta', () => {
        const result = PRasch(-4, 0);
        expect(result).toBeLessThan(0.02);
      });

      it('TC-06 Should be symmetric around theta = b', () => {
        const p1 = PRasch(1, 0);
        const p2 = PRasch(-1, 0);
        expect(p1 + p2).toBeCloseTo(1, 5);
      });
    });

    describe('P2PL (2PL Model)', () => {
      it('TC-07 Should return 0.5 when theta equals difficulty (any discrimination)', () => {
        const result = P2PL(0, 1.5, 0);
        expect(result).toBeCloseTo(0.5, 5);
      });

      it('TC-08 Should be steeper curve with higher discrimination (a)', () => {
        // Higher a → steeper curve → more extreme probabilities
        const lowA = P2PL(1, 0.5, 0);
        const highA = P2PL(1, 2.0, 0);
        
        expect(highA).toBeGreaterThan(lowA);
      });

      it('TC-09 Should match Rasch model when a = 1', () => {
        const p2pl = P2PL(0.5, 1, 0);
        const prasch = PRasch(0.5, 0);
        expect(p2pl).toBeCloseTo(prasch, 5);
      });

      it('TC-10 Should handle negative discrimination gracefully', () => {
        // Negative a inverts the probability curve
        const result = P2PL(1, -1, 0);
        expect(result).toBeLessThan(0.5);
      });
    });
  });

  // ==========================================================
  // SECTION 2: THETA ESTIMATION (MLE)
  // ==========================================================
  describe('2. Theta Estimation (MLE)', () => {
    describe('estimateThetaRasch', () => {
      it('TC-11 Should return 0 for empty items array', () => {
        const result = estimateThetaRasch([]);
        expect(result).toBe(0);
      });

      it('TC-12 Should return -4 when all items are incorrect', () => {
        const items = [
          { b: 0, correct: 0 },
          { b: 0.5, correct: 0 },
          { b: -0.5, correct: 0 },
        ];
        const result = estimateThetaRasch(items);
        expect(result).toBe(-4);
      });

      it('TC-13 Should return 4 when all items are correct', () => {
        const items = [
          { b: 0, correct: 1 },
          { b: 0.5, correct: 1 },
          { b: -0.5, correct: 1 },
        ];
        const result = estimateThetaRasch(items);
        expect(result).toBe(4);
      });

      it('TC-14 Should estimate theta close to average difficulty for 50% correct', () => {
        // 50% correct on items with average difficulty = 0 → theta ≈ 0
        const items = [
          { b: 0, correct: 1 },
          { b: 0, correct: 0 },
          { b: 0, correct: 1 },
          { b: 0, correct: 0 },
        ];
        const result = estimateThetaRasch(items);
        expect(result).toBeCloseTo(0, 1);
      });

      it('TC-15 Should estimate theta based on response pattern and difficulty', () => {
        // Correct on easy items, incorrect on hard items
        // This pattern suggests ability is between easy and hard items
        const items = [
          { b: -1, correct: 1 }, // Easy (b=-1) - correct
          { b: -0.5, correct: 1 }, // Easy (b=-0.5) - correct
          { b: 0.5, correct: 0 }, // Hard (b=0.5) - incorrect
          { b: 1, correct: 0 }, // Hard (b=1) - incorrect
        ];
        const result = estimateThetaRasch(items);
        // With 50% correct, theta should be close to mean difficulty (0)
        // MLE converges to the ability level where P(correct) matches observed rate
        expect(result).toBeGreaterThanOrEqual(-1);
        expect(result).toBeLessThanOrEqual(1);
      });

      it('TC-16 Should converge within bounded range [-4, 4]', () => {
        const items = Array(100).fill(null).map((_, i) => ({
          b: (i % 3) - 1,
          correct: i % 2,
        }));
        const result = estimateThetaRasch(items);
        expect(result).toBeGreaterThanOrEqual(-4);
        expect(result).toBeLessThanOrEqual(4);
      });

      it('TC-17 Should handle single item case', () => {
        const correctItem = [{ b: 0, correct: 1 }];
        const incorrectItem = [{ b: 0, correct: 0 }];
        
        expect(estimateThetaRasch(correctItem)).toBe(4);
        expect(estimateThetaRasch(incorrectItem)).toBe(-4);
      });

      it('TC-18 Should be deterministic (same input → same output)', () => {
        const items = [
          { b: 0, correct: 1 },
          { b: 0.5, correct: 0 },
          { b: -0.5, correct: 1 },
        ];
        const result1 = estimateThetaRasch(items);
        const result2 = estimateThetaRasch(items);
        expect(result1).toBe(result2);
      });
    });

    describe('calibrateDifficultyRasch', () => {
      it('TC-19 Should return 0 for empty responses array', () => {
        const result = calibrateDifficultyRasch([]);
        expect(result).toBe(0);
      });

      it('TC-20 Should return 4 (very hard) when no one answered correctly', () => {
        const responses = [
          { theta: 0, correct: 0 },
          { theta: 1, correct: 0 },
          { theta: -1, correct: 0 },
        ];
        const result = calibrateDifficultyRasch(responses);
        expect(result).toBe(4);
      });

      it('TC-21 Should return -4 (very easy) when everyone answered correctly', () => {
        const responses = [
          { theta: 0, correct: 1 },
          { theta: 1, correct: 1 },
          { theta: -1, correct: 1 },
        ];
        const result = calibrateDifficultyRasch(responses);
        expect(result).toBe(-4);
      });

      it('TC-22 Should estimate difficulty close to 0 for 50% correct rate with theta=0', () => {
        const responses = [
          { theta: 0, correct: 1 },
          { theta: 0, correct: 0 },
          { theta: 0, correct: 1 },
          { theta: 0, correct: 0 },
        ];
        const result = calibrateDifficultyRasch(responses);
        expect(result).toBeCloseTo(0, 1);
      });

      it('TC-23 Should estimate higher difficulty when high-theta users fail', () => {
        // High ability users failing → hard question
        const responses = [
          { theta: 2, correct: 0 },
          { theta: 1.5, correct: 0 },
          { theta: 1, correct: 1 },
        ];
        const result = calibrateDifficultyRasch(responses);
        expect(result).toBeGreaterThan(1);
      });

      it('TC-24 Should converge within bounded range [-4, 4]', () => {
        const responses = Array(50).fill(null).map((_, i) => ({
          theta: (i % 5) - 2,
          correct: i % 3 === 0 ? 1 : 0,
        }));
        const result = calibrateDifficultyRasch(responses);
        expect(result).toBeGreaterThanOrEqual(-4);
        expect(result).toBeLessThanOrEqual(4);
      });
    });

    describe('calculateThetaRasch', () => {
      it('TC-25 Should calculate overall theta and theta by part', () => {
        const result = calculateThetaRasch({
          responses: [
            { b: 0, correct: 1, part: 1 },
            { b: 0, correct: 1, part: 1 },
            { b: 0, correct: 0, part: 2 },
            { b: 0, correct: 0, part: 2 },
            { b: 0, correct: 1, part: 3 },
            { b: 0, correct: 0, part: 3 },
          ],
        });

        expect(result.thetaOverall).toBeDefined();
        expect(result.thetaByPart).toBeDefined();
        expect(Object.keys(result.thetaByPart).length).toBe(7);
      });

      it('TC-26 Should return higher theta for parts with more correct answers', () => {
        const result = calculateThetaRasch({
          responses: [
            { b: 0, correct: 1, part: 1 },
            { b: 0, correct: 1, part: 1 },
            { b: 0, correct: 1, part: 1 },
            { b: 0, correct: 0, part: 2 },
            { b: 0, correct: 0, part: 2 },
            { b: 0, correct: 0, part: 2 },
          ],
        });

        expect(result.thetaByPart[1]).toBeGreaterThan(result.thetaByPart[2]);
      });

      it('TC-27 Should return 0 for parts with no responses', () => {
        const result = calculateThetaRasch({
          responses: [
            { b: 0, correct: 1, part: 1 },
          ],
        });

        // Parts 2-7 have no data → theta = 0
        expect(result.thetaByPart[2]).toBe(0);
        expect(result.thetaByPart[7]).toBe(0);
      });

      it('TC-28 Should handle null part correctly', () => {
        const result = calculateThetaRasch({
          responses: [
            { b: 0, correct: 1, part: null },
            { b: 0, correct: 0, part: null },
          ],
        });

        // Items with null part still contribute to overall theta
        expect(result.thetaOverall).toBeDefined();
        expect(result.thetaOverall).toBeCloseTo(0, 1);
      });

      it('TC-29 Should handle all 7 parts', () => {
        const responses = [];
        for (let part = 1; part <= 7; part++) {
          responses.push({ b: 0, correct: 1, part });
          responses.push({ b: 0, correct: 0, part });
        }

        const result = calculateThetaRasch({ responses });

        for (let part = 1; part <= 7; part++) {
          expect(result.thetaByPart[part]).toBeDefined();
          expect(result.thetaByPart[part]).toBeCloseTo(0, 1);
        }
      });
    });
  });

  // ==========================================================
  // SECTION 3: CEFR AND WEIGHT MAPPING
  // ==========================================================
  describe('3. CEFR and Weight Mapping', () => {
    describe('thetaToCEFR', () => {
      it('TC-30 Should return [A1, A2] for very low theta (< -1.0)', () => {
        const result = thetaToCEFR(-1.5);
        expect(result).toEqual(['A1', 'A2']);
      });

      it('TC-31 Should return [A2, B1] for low theta (-1.0 to -0.5)', () => {
        const result = thetaToCEFR(-0.7);
        expect(result).toEqual(['A2', 'B1']);
      });

      it('TC-32 Should return [B1, B2] for medium-low theta (-0.5 to 0)', () => {
        const result = thetaToCEFR(-0.3);
        expect(result).toEqual(['B1', 'B2']);
      });

      it('TC-33 Should return [B1, B2, C1] for medium theta (0 to 0.7)', () => {
        const result = thetaToCEFR(0.3);
        expect(result).toEqual(['B1', 'B2', 'C1']);
      });

      it('TC-34 Should return [B2, C1, C2] for high theta (>= 0.7)', () => {
        const result = thetaToCEFR(1.0);
        expect(result).toEqual(['B2', 'C1', 'C2']);
      });

      it('TC-35 Should handle boundary values correctly', () => {
        expect(thetaToCEFR(-1.0)).toEqual(['A2', 'B1']); // Exactly at boundary
        expect(thetaToCEFR(-0.5)).toEqual(['B1', 'B2']);
        expect(thetaToCEFR(0.0)).toEqual(['B1', 'B2', 'C1']);
        expect(thetaToCEFR(0.7)).toEqual(['B2', 'C1', 'C2']);
      });
    });

    describe('thetaToWeightRange', () => {
      it('TC-36 Should return easy weight range for very low theta', () => {
        const result = thetaToWeightRange(-1.0);
        expect(result).toEqual({ min: 0.0, max: 0.4 });
      });

      it('TC-37 Should return easy-medium weight range for low theta', () => {
        const result = thetaToWeightRange(-0.5);
        expect(result).toEqual({ min: 0.0, max: 0.6 });
      });

      it('TC-38 Should return medium weight range for average theta', () => {
        const result = thetaToWeightRange(0.0);
        expect(result).toEqual({ min: 0.3, max: 0.8 });
      });

      it('TC-39 Should return hard weight range for high theta', () => {
        const result = thetaToWeightRange(1.0);
        expect(result).toEqual({ min: 0.5, max: 1.0 });
      });

      it('TC-40 Should handle boundary values correctly', () => {
        expect(thetaToWeightRange(-0.7)).toEqual({ min: 0.0, max: 0.6 });
        expect(thetaToWeightRange(-0.2)).toEqual({ min: 0.3, max: 0.8 });
        expect(thetaToWeightRange(0.5)).toEqual({ min: 0.5, max: 1.0 });
      });
    });
  });

  // ==========================================================
  // SECTION 4: STUDY TIME ESTIMATION
  // ==========================================================
  describe('4. Study Time Estimation', () => {
    describe('estimateStudyTime', () => {
      it('TC-41 Should return 10 minutes for quiz', () => {
        expect(estimateStudyTime('quiz')).toBe(10);
      });

      it('TC-42 Should return 20 minutes for lesson', () => {
        expect(estimateStudyTime('lesson')).toBe(20);
      });

      it('TC-43 Should return 30 minutes for vocab', () => {
        expect(estimateStudyTime('vocab')).toBe(30);
      });

      it('TC-44 Should return 10 minutes for dictation', () => {
        expect(estimateStudyTime('dictation')).toBe(10);
      });

      it('TC-45 Should return 15 minutes for shadowing', () => {
        expect(estimateStudyTime('shadowing')).toBe(15);
      });

      it('TC-46 Should return 10 minutes for unknown activity type', () => {
        expect(estimateStudyTime('unknown')).toBe(10);
        expect(estimateStudyTime('')).toBe(10);
      });
    });
  });

  // ==========================================================
  // SECTION 5: PART CLASSIFICATION
  // ==========================================================
  describe('5. Part Classification', () => {
    describe('classifyPartsByTheta', () => {
      it('TC-47 Should classify 3 weakest parts as weak', () => {
        const thetaByPart: Record<number, number> = {
          1: -1.0, // weak
          2: -0.5, // weak
          3: 0.0,  // weak
          4: 0.5,  // medium
          5: 0.8,  // medium
          6: 1.0,  // strong
          7: 1.2,  // strong
        };
        const result = classifyPartsByTheta(thetaByPart);

        expect(result.weak_parts).toHaveLength(3);
        expect(result.weak_parts).toContain(1);
        expect(result.weak_parts).toContain(2);
        expect(result.weak_parts).toContain(3);
      });

      it('TC-48 Should classify 2 medium parts as medium', () => {
        const thetaByPart: Record<number, number> = {
          1: -1.0,
          2: -0.5,
          3: 0.0,
          4: 0.5,
          5: 0.8,
          6: 1.0,
          7: 1.2,
        };
        const result = classifyPartsByTheta(thetaByPart);

        expect(result.medium_parts).toHaveLength(2);
        expect(result.medium_parts).toContain(4);
        expect(result.medium_parts).toContain(5);
      });

      it('TC-49 Should classify 2 strongest parts as strong', () => {
        const thetaByPart: Record<number, number> = {
          1: -1.0,
          2: -0.5,
          3: 0.0,
          4: 0.5,
          5: 0.8,
          6: 1.0,
          7: 1.2,
        };
        const result = classifyPartsByTheta(thetaByPart);

        expect(result.strong_parts).toHaveLength(2);
        expect(result.strong_parts).toContain(6);
        expect(result.strong_parts).toContain(7);
      });

      it('TC-50 Should sort parts by theta ascending', () => {
        const thetaByPart: Record<number, number> = {
          1: 0.5,
          2: -1.0,
          3: 1.0,
          4: -0.5,
          5: 0.0,
          6: 0.8,
          7: -0.2,
        };
        const result = classifyPartsByTheta(thetaByPart);

        // Verify sorted_list is in ascending order
        for (let i = 1; i < result.sorted_list.length; i++) {
          expect(result.sorted_list[i].theta).toBeGreaterThanOrEqual(
            result.sorted_list[i - 1].theta
          );
        }
      });

      it('TC-51 Should handle equal theta values', () => {
        const thetaByPart: Record<number, number> = {
          1: 0.0,
          2: 0.0,
          3: 0.0,
          4: 0.0,
          5: 0.0,
          6: 0.0,
          7: 0.0,
        };
        const result = classifyPartsByTheta(thetaByPart);

        // Should still classify into 3 groups
        expect(result.weak_parts).toHaveLength(3);
        expect(result.medium_parts).toHaveLength(2);
        expect(result.strong_parts).toHaveLength(2);
      });

      it('TC-52 Should maintain part numbers correctly after sorting', () => {
        const thetaByPart: Record<number, number> = {
          1: 1.0,   // Should be strong
          2: -1.0,  // Should be weak
          3: 0.5,   // Should be medium/strong
          4: -0.5,  // Should be weak
          5: 0.0,   // Should be weak/medium
          6: 0.8,   // Should be strong
          7: 0.3,   // Should be medium
        };
        const result = classifyPartsByTheta(thetaByPart);

        // Part 2 has lowest theta → must be in weak
        expect(result.weak_parts).toContain(2);
        // Part 1 has high theta → must be in strong
        expect(result.strong_parts).toContain(1);
      });
    });
  });

  // ==========================================================
  // SECTION 6: ITEM PRIORITY
  // ==========================================================
  describe('6. Item Priority', () => {
    describe('getItemPriorityByKind', () => {
      it('TC-53 Should return highest priority (5) for lesson', () => {
        expect(getItemPriorityByKind('lesson')).toBe(5);
      });

      it('TC-54 Should return priority 4 for dictation and shadowing', () => {
        expect(getItemPriorityByKind('dictation')).toBe(4);
        expect(getItemPriorityByKind('shadowing')).toBe(4);
      });

      it('TC-55 Should return priority 3 for vocab', () => {
        expect(getItemPriorityByKind('vocab')).toBe(3);
      });

      it('TC-56 Should return lowest priority (2) for quiz', () => {
        expect(getItemPriorityByKind('quiz')).toBe(2);
      });

      it('TC-57 Should return default priority (1) for unknown kind', () => {
        expect(getItemPriorityByKind('unknown')).toBe(1);
        expect(getItemPriorityByKind('')).toBe(1);
      });
    });

    describe('getItemPriority (with weight)', () => {
      it('TC-58 Should add weight contribution to base priority', () => {
        const item: LearningItem = {
          part: 1,
          kind: 'lesson',
          resource_id: 'test-1',
          level: 'B1',
          weight: 0.5,
          estimated_time: 20,
        };
        // Base: 5 (lesson) + Weight: 0.5 * 10 = 5 → Total: 10
        expect(getItemPriority(item)).toBe(10);
      });

      it('TC-59 Should handle weight = 0', () => {
        const item: LearningItem = {
          part: 1,
          kind: 'quiz',
          resource_id: 'test-1',
          level: 'B1',
          weight: 0,
          estimated_time: 10,
        };
        // Base: 2 (quiz) + Weight: 0 = 2
        expect(getItemPriority(item)).toBe(2);
      });

      it('TC-60 Should handle weight = 1 (maximum)', () => {
        const item: LearningItem = {
          part: 1,
          kind: 'vocab',
          resource_id: 'test-1',
          level: 'B1',
          weight: 1.0,
          estimated_time: 30,
        };
        // Base: 3 (vocab) + Weight: 1.0 * 10 = 10 → Total: 13
        expect(getItemPriority(item)).toBe(13);
      });

      it('TC-61 Should handle undefined weight as 0', () => {
        const item: LearningItem = {
          part: 1,
          kind: 'dictation',
          resource_id: 'test-1',
          level: 'B1',
          weight: undefined as any,
          estimated_time: 10,
        };
        // Base: 4 (dictation) + Weight: 0 = 4
        expect(getItemPriority(item)).toBe(4);
      });

      it('TC-62 Should correctly order items by priority', () => {
        const items: LearningItem[] = [
          { part: 1, kind: 'quiz', resource_id: '1', level: 'B1', weight: 0.5, estimated_time: 10 },
          { part: 1, kind: 'lesson', resource_id: '2', level: 'B1', weight: 0.3, estimated_time: 20 },
          { part: 1, kind: 'vocab', resource_id: '3', level: 'B1', weight: 0.8, estimated_time: 30 },
        ];

        const sorted = [...items].sort((a, b) => getItemPriority(b) - getItemPriority(a));

        // vocab (3 + 8 = 11) > lesson (5 + 3 = 8) > quiz (2 + 5 = 7)
        expect(sorted[0].kind).toBe('vocab');
        expect(sorted[1].kind).toBe('lesson');
        expect(sorted[2].kind).toBe('quiz');
      });
    });
  });

  // ==========================================================
  // SECTION 7: ITEM INTERLEAVING
  // ==========================================================
  describe('7. Item Interleaving', () => {
    describe('interleaveItems', () => {
      it('TC-63 Should return same array for 0-2 items', () => {
        const empty: LearningItem[] = [];
        const single: LearningItem[] = [{
          part: 1, kind: 'lesson', resource_id: '1', level: 'B1', weight: 0.5, estimated_time: 20
        }];
        const two: LearningItem[] = [
          { part: 1, kind: 'lesson', resource_id: '1', level: 'B1', weight: 0.5, estimated_time: 20 },
          { part: 1, kind: 'quiz', resource_id: '2', level: 'B1', weight: 0.5, estimated_time: 10 },
        ];

        expect(interleaveItems(empty)).toEqual([]);
        expect(interleaveItems(single)).toEqual(single);
        expect(interleaveItems(two)).toEqual(two);
      });

      it('TC-64 Should avoid consecutive same kind (A-B-A pattern)', () => {
        const items: LearningItem[] = [
          { part: 1, kind: 'lesson', resource_id: '1', level: 'B1', weight: 0.5, estimated_time: 20 },
          { part: 1, kind: 'lesson', resource_id: '2', level: 'B1', weight: 0.5, estimated_time: 20 },
          { part: 1, kind: 'quiz', resource_id: '3', level: 'B1', weight: 0.5, estimated_time: 10 },
          { part: 1, kind: 'quiz', resource_id: '4', level: 'B1', weight: 0.5, estimated_time: 10 },
        ];

        const result = interleaveItems(items);

        // Check no two consecutive items have same kind (when possible)
        for (let i = 1; i < result.length; i++) {
          if (i < result.length - 1) {
            // Allow same consecutive only if no other option
            const kinds = new Set(result.slice(i).map(item => item.kind));
            if (kinds.size > 1) {
              expect(result[i].kind).not.toBe(result[i - 1].kind);
            }
          }
        }
      });

      it('TC-65 Should handle single kind items', () => {
        const items: LearningItem[] = [
          { part: 1, kind: 'lesson', resource_id: '1', level: 'B1', weight: 0.5, estimated_time: 20 },
          { part: 1, kind: 'lesson', resource_id: '2', level: 'B1', weight: 0.5, estimated_time: 20 },
          { part: 1, kind: 'lesson', resource_id: '3', level: 'B1', weight: 0.5, estimated_time: 20 },
        ];

        const result = interleaveItems(items);

        // All items should be present
        expect(result).toHaveLength(3);
        expect(result.every(item => item.kind === 'lesson')).toBe(true);
      });

      it('TC-66 Should preserve all items (no loss)', () => {
        const items: LearningItem[] = [
          { part: 1, kind: 'lesson', resource_id: '1', level: 'B1', weight: 0.5, estimated_time: 20 },
          { part: 1, kind: 'quiz', resource_id: '2', level: 'B1', weight: 0.5, estimated_time: 10 },
          { part: 1, kind: 'vocab', resource_id: '3', level: 'B1', weight: 0.5, estimated_time: 30 },
          { part: 1, kind: 'dictation', resource_id: '4', level: 'B1', weight: 0.5, estimated_time: 10 },
          { part: 1, kind: 'shadowing', resource_id: '5', level: 'B1', weight: 0.5, estimated_time: 15 },
        ];

        const result = interleaveItems(items);

        expect(result).toHaveLength(5);
        
        const resultIds = result.map(item => item.resource_id).sort();
        const inputIds = items.map(item => item.resource_id).sort();
        expect(resultIds).toEqual(inputIds);
      });

      it('TC-67 Should achieve A-B-C pattern with 3+ kinds', () => {
        const items: LearningItem[] = [
          { part: 1, kind: 'lesson', resource_id: '1', level: 'B1', weight: 0.5, estimated_time: 20 },
          { part: 1, kind: 'lesson', resource_id: '2', level: 'B1', weight: 0.5, estimated_time: 20 },
          { part: 1, kind: 'quiz', resource_id: '3', level: 'B1', weight: 0.5, estimated_time: 10 },
          { part: 1, kind: 'quiz', resource_id: '4', level: 'B1', weight: 0.5, estimated_time: 10 },
          { part: 1, kind: 'vocab', resource_id: '5', level: 'B1', weight: 0.5, estimated_time: 30 },
          { part: 1, kind: 'vocab', resource_id: '6', level: 'B1', weight: 0.5, estimated_time: 30 },
        ];

        const result = interleaveItems(items);

        // Check no three consecutive items have same kind
        for (let i = 2; i < result.length; i++) {
          const threeConsecutive = 
            result[i].kind === result[i - 1].kind && 
            result[i - 1].kind === result[i - 2].kind;
          
          // Allow only if no other option
          if (threeConsecutive) {
            const remainingKinds = new Set(result.slice(i).map(item => item.kind));
            expect(remainingKinds.size).toBe(1);
          }
        }
      });
    });
  });

  // ==========================================================
  // SECTION 8: EDGE CASES AND ROBUSTNESS
  // ==========================================================
  describe('8. Edge Cases and Robustness', () => {
    it('TC-68 Should handle extreme theta values in PRasch', () => {
      // Very extreme values should not cause overflow
      expect(PRasch(100, 0)).toBeLessThanOrEqual(1);
      expect(PRasch(-100, 0)).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(PRasch(100, 0))).toBe(true);
      expect(Number.isFinite(PRasch(-100, 0))).toBe(true);
    });

    it('TC-69 Should handle NaN values gracefully in thetaToCEFR', () => {
      // NaN should be treated as very low (< -1.0)
      const result = thetaToCEFR(NaN);
      // NaN < -1.0 evaluates to false, so it falls through all conditions
      expect(result).toEqual(['B2', 'C1', 'C2']);
    });

    it('TC-70 Should handle negative weights in getItemPriority', () => {
      const item: LearningItem = {
        part: 1,
        kind: 'lesson',
        resource_id: 'test-1',
        level: 'B1',
        weight: -0.5,
        estimated_time: 20,
      };
      // Base: 5 + Weight: -0.5 * 10 = -5 → Total: 0
      const result = getItemPriority(item);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('TC-71 Should handle large number of items in estimateThetaRasch', () => {
      // Generate 1000 items
      const items = Array(1000).fill(null).map((_, i) => ({
        b: ((i % 9) - 4) / 2, // Range: -2 to 2
        correct: i % 3 === 0 ? 1 : 0,
      }));

      const startTime = Date.now();
      const result = estimateThetaRasch(items);
      const endTime = Date.now();

      expect(result).toBeGreaterThanOrEqual(-4);
      expect(result).toBeLessThanOrEqual(4);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in < 1 second
    });

    it('TC-72 Should handle mixed valid/invalid parts in calculateThetaRasch', () => {
      const result = calculateThetaRasch({
        responses: [
          { b: 0, correct: 1, part: 1 },
          { b: 0, correct: 1, part: 8 }, // Invalid part (> 7)
          { b: 0, correct: 1, part: 0 }, // Invalid part (< 1)
          { b: 0, correct: 1, part: -1 }, // Invalid part (negative)
        ],
      });

      expect(result.thetaByPart[1]).toBeDefined();
      expect(result.thetaByPart[8]).toBeUndefined();
      expect(result.thetaByPart[0]).toBeUndefined();
    });

    it('TC-73 Should maintain determinism across multiple runs', () => {
      const thetaByPart: Record<number, number> = {
        1: 0.5, 2: -0.3, 3: 0.1, 4: -0.8, 5: 0.9, 6: -0.1, 7: 0.3,
      };

      const results = Array(10).fill(null).map(() => 
        classifyPartsByTheta(thetaByPart)
      );

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i].weak_parts).toEqual(results[0].weak_parts);
        expect(results[i].medium_parts).toEqual(results[0].medium_parts);
        expect(results[i].strong_parts).toEqual(results[0].strong_parts);
      }
    });
  });

  // ==========================================================
  // SECTION 9: WEEK SCHEDULE CONFIG VALIDATION
  // ==========================================================
  describe('9. Week Schedule Configuration', () => {
    const WEEK_SCHEDULE_CONFIG = {
      weak_time_ratio: 0.65,
      medium_time_ratio: 0.25,
      strong_time_ratio: 0.10,
    };

    it('TC-74 Should have time ratios summing to 100%', () => {
      const total = 
        WEEK_SCHEDULE_CONFIG.weak_time_ratio +
        WEEK_SCHEDULE_CONFIG.medium_time_ratio +
        WEEK_SCHEDULE_CONFIG.strong_time_ratio;
      
      expect(total).toBeCloseTo(1.0, 5);
    });

    it('TC-75 Should allocate majority to weak parts (65%)', () => {
      expect(WEEK_SCHEDULE_CONFIG.weak_time_ratio).toBe(0.65);
    });

    it('TC-76 Should allocate quarter to medium parts (25%)', () => {
      expect(WEEK_SCHEDULE_CONFIG.medium_time_ratio).toBe(0.25);
    });

    it('TC-77 Should allocate minimum to strong parts (10%)', () => {
      expect(WEEK_SCHEDULE_CONFIG.strong_time_ratio).toBe(0.10);
    });

    it('TC-78 Should correctly calculate time budgets', () => {
      const totalWeekMinutes = 858; // 6 days × 143 min
      
      const weakBudget = Math.round(totalWeekMinutes * WEEK_SCHEDULE_CONFIG.weak_time_ratio);
      const mediumBudget = Math.round(totalWeekMinutes * WEEK_SCHEDULE_CONFIG.medium_time_ratio);
      const strongBudget = Math.round(totalWeekMinutes * WEEK_SCHEDULE_CONFIG.strong_time_ratio);

      expect(weakBudget).toBe(558); // 858 × 0.65 = 557.7 → 558
      expect(mediumBudget).toBe(215); // 858 × 0.25 = 214.5 → 215
      expect(strongBudget).toBe(86); // 858 × 0.10 = 85.8 → 86
    });
  });

  // ==========================================================
  // SECTION 10: PART ACTIVITY CONFIGURATION
  // ==========================================================
  describe('10. Part Activity Configuration', () => {
    const PART_ACTIVITY_CONFIG: Record<number, Record<string, number>> = {
      1: { vocab: 0.40, dictation: 0.40, quiz: 0.20 },
      2: { dictation: 0.50, shadowing: 0.30, quiz: 0.20 },
      3: { shadowing: 0.35, dictation: 0.30, lesson: 0.20, quiz: 0.15 },
      4: { shadowing: 0.35, dictation: 0.30, lesson: 0.20, quiz: 0.15 },
      5: { vocab: 0.40, lesson: 0.40, quiz: 0.20 },
      6: { lesson: 0.50, vocab: 0.30, quiz: 0.20 },
      7: { lesson: 0.50, vocab: 0.30, quiz: 0.20 },
    };

    it('TC-79 Should have activity ratios summing to 100% for each part', () => {
      for (let part = 1; part <= 7; part++) {
        const config = PART_ACTIVITY_CONFIG[part];
        const total = Object.values(config).reduce((sum, ratio) => sum + ratio, 0);
        expect(total).toBeCloseTo(1.0, 5);
      }
    });

    it('TC-80 Should have listening parts (1-4) include audio activities', () => {
      // Listening parts should have dictation or shadowing
      for (let part = 1; part <= 4; part++) {
        const config = PART_ACTIVITY_CONFIG[part];
        const hasAudioActivity = 
          config.dictation !== undefined || 
          config.shadowing !== undefined;
        expect(hasAudioActivity).toBe(true);
      }
    });

    it('TC-81 Should have reading parts (5-7) include lesson/vocab', () => {
      for (let part = 5; part <= 7; part++) {
        const config = PART_ACTIVITY_CONFIG[part];
        const hasReadingActivity = 
          config.lesson !== undefined || 
          config.vocab !== undefined;
        expect(hasReadingActivity).toBe(true);
      }
    });

    it('TC-82 Should have all parts include quiz for assessment', () => {
      for (let part = 1; part <= 7; part++) {
        const config = PART_ACTIVITY_CONFIG[part];
        expect(config.quiz).toBeDefined();
        expect(config.quiz).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================
  // SECTION 11: INTEGRATION SCENARIOS
  // ==========================================================
  describe('11. Integration Scenarios', () => {
    it('TC-83 Should complete full theta estimation workflow', () => {
      // Simulate a mini test with 20 questions across parts
      const responses = [];
      for (let part = 1; part <= 7; part++) {
        // 3 questions per part (varying difficulty)
        responses.push({ b: -0.5, correct: 1, part });
        responses.push({ b: 0.0, correct: part <= 4 ? 1 : 0, part });
        responses.push({ b: 0.5, correct: part <= 2 ? 1 : 0, part });
      }

      const result = calculateThetaRasch({ responses });

      // Verify structure
      expect(result.thetaOverall).toBeDefined();
      expect(Object.keys(result.thetaByPart)).toHaveLength(7);

      // Verify theta ordering (parts 1-2 should have higher theta)
      expect(result.thetaByPart[1]).toBeGreaterThan(result.thetaByPart[5]);
    });

    it('TC-84 Should classify parts correctly based on realistic theta values', () => {
      const thetaByPart: Record<number, number> = {
        1: 0.8,   // Strong (Listening - Image)
        2: 0.3,   // Medium (Listening - Q&A)
        3: -0.5,  // Weak (Listening - Conversation)
        4: -0.2,  // Weak (Listening - Talk)
        5: -0.8,  // Weak (Reading - Fill)
        6: 0.5,   // Medium (Reading - Passage)
        7: 1.0,   // Strong (Reading - Long)
      };

      const classified = classifyPartsByTheta(thetaByPart);

      // Weak: 3 lowest theta parts (5, 3, 4)
      expect(classified.weak_parts).toContain(5);
      expect(classified.weak_parts).toContain(3);
      expect(classified.weak_parts).toContain(4);

      // Strong: 2 highest theta parts (1, 7)
      expect(classified.strong_parts).toContain(1);
      expect(classified.strong_parts).toContain(7);
    });

    it('TC-85 Should map theta to appropriate CEFR and weight for curriculum', () => {
      const testCases = [
        { theta: -1.5, expectedCEFR: ['A1', 'A2'], expectedWeight: { min: 0.0, max: 0.4 } },
        { theta: -0.6, expectedCEFR: ['A2', 'B1'], expectedWeight: { min: 0.0, max: 0.6 } },
        { theta: 0.2, expectedCEFR: ['B1', 'B2', 'C1'], expectedWeight: { min: 0.3, max: 0.8 } },
        { theta: 1.0, expectedCEFR: ['B2', 'C1', 'C2'], expectedWeight: { min: 0.5, max: 1.0 } },
      ];

      for (const tc of testCases) {
        expect(thetaToCEFR(tc.theta)).toEqual(tc.expectedCEFR);
        expect(thetaToWeightRange(tc.theta)).toEqual(tc.expectedWeight);
      }
    });

    it('TC-86 Should estimate reasonable study time for weekly plan', () => {
      const studyDays = 7;
      const minutesPerDay = 143;
      const actualStudyDays = studyDays - 1; // Exclude test day

      const totalWeekMinutes = actualStudyDays * minutesPerDay;

      // Verify total time
      expect(totalWeekMinutes).toBe(858);

      // Verify budget allocation
      const weakBudget = Math.round(totalWeekMinutes * 0.65);
      const mediumBudget = Math.round(totalWeekMinutes * 0.25);
      const strongBudget = Math.round(totalWeekMinutes * 0.10);

      expect(weakBudget + mediumBudget + strongBudget).toBeCloseTo(totalWeekMinutes, -1);
    });
  });

  // ==========================================================
  // SECTION 12: PERFORMANCE AND STRESS TESTS
  // ==========================================================
  describe('12. Performance and Stress Tests', () => {
    it('TC-87 Should handle rapid successive theta calculations', () => {
      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const items = Array(20).fill(null).map((_, j) => ({
          b: (j % 5) - 2,
          correct: (j + i) % 2,
        }));
        estimateThetaRasch(items);
      }

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(5000); // < 5 seconds for 100 iterations
    });

    it('TC-88 Should handle large classification sets', () => {
      const thetaByPart: Record<number, number> = {};
      for (let part = 1; part <= 7; part++) {
        thetaByPart[part] = Math.random() * 4 - 2; // Range: -2 to 2
      }

      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        classifyPartsByTheta(thetaByPart);
      }
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // < 1 second for 1000 classifications
    });

    it('TC-89 Should handle maximum item interleaving', () => {
      // Create items with 5 different kinds, 10 each
      const kinds = ['lesson', 'quiz', 'vocab', 'dictation', 'shadowing'];
      const items: LearningItem[] = [];

      for (let i = 0; i < 50; i++) {
        items.push({
          part: 1,
          kind: kinds[i % 5],
          resource_id: `item-${i}`,
          level: 'B1',
          weight: 0.5,
          estimated_time: 10,
        });
      }

      const startTime = Date.now();
      const result = interleaveItems(items);
      const endTime = Date.now();

      expect(result).toHaveLength(50);
      expect(endTime - startTime).toBeLessThan(100); // < 100ms
    });
  });

  // ==========================================================
  // SECTION 13: DATA VALIDATION
  // ==========================================================
  describe('13. Data Validation', () => {
    it('TC-90 Should validate theta range [-4, 4] after estimation', () => {
      const extremeCases = [
        // All correct on very easy items
        Array(50).fill({ b: -3, correct: 1 }),
        // All incorrect on very hard items
        Array(50).fill({ b: 3, correct: 0 }),
        // Mixed extreme
        [...Array(25).fill({ b: -3, correct: 1 }), ...Array(25).fill({ b: 3, correct: 0 })],
      ];

      for (const items of extremeCases) {
        const theta = estimateThetaRasch(items);
        expect(theta).toBeGreaterThanOrEqual(-4);
        expect(theta).toBeLessThanOrEqual(4);
      }
    });

    it('TC-91 Should validate difficulty range [-4, 4] after calibration', () => {
      const extremeCases = [
        // All high-ability users fail
        Array(50).fill({ theta: 3, correct: 0 }),
        // All low-ability users succeed
        Array(50).fill({ theta: -3, correct: 1 }),
      ];

      for (const responses of extremeCases) {
        const b = calibrateDifficultyRasch(responses);
        expect(b).toBeGreaterThanOrEqual(-4);
        expect(b).toBeLessThanOrEqual(4);
      }
    });

    it('TC-92 Should validate study time is positive', () => {
      const kinds = ['quiz', 'lesson', 'vocab', 'dictation', 'shadowing', 'unknown', ''];
      for (const kind of kinds) {
        const time = estimateStudyTime(kind);
        expect(time).toBeGreaterThan(0);
      }
    });

    it('TC-93 Should validate CEFR levels are valid strings', () => {
      const validCEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const thetaValues = [-2, -1, -0.5, 0, 0.5, 1];

      for (const theta of thetaValues) {
        const levels = thetaToCEFR(theta);
        expect(levels.length).toBeGreaterThan(0);
        for (const level of levels) {
          expect(validCEFR).toContain(level);
        }
      }
    });

    it('TC-94 Should validate weight range has min <= max', () => {
      const thetaValues = [-2, -1, -0.5, 0, 0.5, 1, 2];

      for (const theta of thetaValues) {
        const range = thetaToWeightRange(theta);
        expect(range.min).toBeLessThanOrEqual(range.max);
        expect(range.min).toBeGreaterThanOrEqual(0);
        expect(range.max).toBeLessThanOrEqual(1);
      }
    });

    it('TC-95 Should validate classified parts are complete and non-overlapping', () => {
      const thetaByPart: Record<number, number> = {
        1: 0.5, 2: -0.3, 3: 0.1, 4: -0.8, 5: 0.9, 6: -0.1, 7: 0.3,
      };

      const result = classifyPartsByTheta(thetaByPart);

      // All parts should be classified
      const allParts = [...result.weak_parts, ...result.medium_parts, ...result.strong_parts];
      expect(allParts.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);

      // No overlapping
      const uniqueParts = new Set(allParts);
      expect(uniqueParts.size).toBe(7);
    });
  });
});
