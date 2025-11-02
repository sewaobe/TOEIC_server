import fs from "fs";
import path from "path";

export type Session = { date: string; activity: string; duration: number };

function getOutputsDir() {
  const root = path.resolve(__dirname, "../../../");
  const defaultDir = path.join(root, "toeic_outputs");
  try {
    fs.mkdirSync(defaultDir, { recursive: true });
  } catch {}
  return defaultDir;
}

function tsStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function writeTextReport(label: string, content: string) {
  const dir = getOutputsDir();
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "-");
  const filePath = path.join(dir, `${tsStamp()}-${safeLabel}.txt`);
  try {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`📝 Đã xuất báo cáo: ${filePath}`);
  } catch (e) {
    console.warn("⚠️ Không thể ghi báo cáo:", e);
  }
}

export function normalizeActivityName(name: string) {
  const s = String(name || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .trim();
  const head = s.split(/[:\-]/)[0].trim();
  if (head.startsWith("video")) return "video";
  if (head.startsWith("flashcard")) return "flashcard";
  if (head.startsWith("dictation")) return "dictation";
  if (head.startsWith("shadowing")) return "shadowing";
  if (head.startsWith("quiz")) return "quiz";
  if (
    head.startsWith("mini test") ||
    head.startsWith("mini-test") ||
    head.startsWith("mini_test")
  )
    return "mini_test";
  if (
    head.startsWith("full test") ||
    head.startsWith("full-test") ||
    head.startsWith("full_test")
  )
    return "full_test";
  return s;
}

export function normalizeSessions(week: any): Session[] {
  const sessions: Session[] = [];
  if (!week || !Array.isArray(week.days)) return sessions;
  for (const d of week.days) {
    if (d && typeof d === "object") {
      if (typeof d.activity === "string" && typeof d.duration === "number") {
        sessions.push({
          date: d.date || "",
          activity: d.activity,
          duration: d.duration,
        });
        continue;
      }
      const date = d.date || "";
      for (const [k, v] of Object.entries(d)) {
        if (k === "date") continue;
        const n = Number(v);
        if (!isNaN(n)) sessions.push({ date, activity: k, duration: n });
      }
    }
  }
  return sessions;
}

export function computePlanTotals(plan: any) {
  const perDayTotals: Record<string, number> = {};
  const perWeekTotals: Record<number, number> = {};
  const perPhaseTotals: Record<string, number> = {};
  const byActivityTotals: Record<string, number> = {};
  let courseTotal = 0;

  if (Array.isArray(plan?.schedule_by_week)) {
    plan.schedule_by_week.forEach((week: any) => {
      const weekNo = Number(week?.week) || 0;
      const phase = String(week?.phase || "");
      const sessions = normalizeSessions(week);
      let weekSum = 0;
      for (const s of sessions) {
        const act = normalizeActivityName(s.activity);
        courseTotal += s.duration;
        weekSum += s.duration;
        perDayTotals[s.date] = (perDayTotals[s.date] || 0) + s.duration;
        byActivityTotals[act] = (byActivityTotals[act] || 0) + s.duration;
      }
      if (weekNo)
        perWeekTotals[weekNo] = (perWeekTotals[weekNo] || 0) + weekSum;
      if (phase) perPhaseTotals[phase] = (perPhaseTotals[phase] || 0) + weekSum;
    });
  }

  const estimatedHours = Number(plan?.summary?.estimated_hours || 0);
  const expectedCourseMinutes =
    estimatedHours > 0 ? estimatedHours * 60 : undefined;

  return {
    perDayTotals,
    perWeekTotals,
    perPhaseTotals,
    byActivityTotals,
    courseTotal,
    expectedCourseMinutes,
  };
}

export function computeExpected(plan: any) {
  // Read study days & weekly hours
  const studyDaysPerWeek = Number(
    plan?.summary?.study_days_per_week ?? plan?.study_days_per_week ?? 0
  );
  const weeklyStudyHours = Number(
    plan?.summary?.weekly_study_hours ?? plan?.weekly_study_hours ?? 0
  );
  const rawHoursPerDay = Number(plan?.summary?.hours_per_day ?? 0);

  // Prefer weeklyStudyHours / studyDaysPerWeek when available (FE-provided), fallback to hours_per_day
  let hoursPerDay: number | undefined = undefined;
  if (weeklyStudyHours > 0 && studyDaysPerWeek > 0) {
    hoursPerDay = weeklyStudyHours / studyDaysPerWeek;
  } else if (rawHoursPerDay > 0) {
    hoursPerDay = rawHoursPerDay;
  }

  const expectedDayMinutes =
    typeof hoursPerDay === "number" && hoursPerDay > 0
      ? Math.round(hoursPerDay * 60)
      : undefined;
  const expectedWeekMinutes =
    expectedDayMinutes && studyDaysPerWeek > 0
      ? expectedDayMinutes * studyDaysPerWeek
      : undefined;

  const expectedPerPhase: Record<string, number> = {};
  const expectedByActivity: Record<string, number> = {};

  const estimatedHours = Number(plan?.summary?.estimated_hours || 0);
  const expectedCourseMinutes =
    estimatedHours > 0 ? estimatedHours * 60 : undefined;
  // 1) Tính expectedByActivity theo bảng phân bổ band (nếu có current_score)
  type Alloc = Record<string, number>;
  const BAND_TABLE: Array<{ min: number; max: number; alloc: Alloc }> = [
    {
      min: 0,
      max: 200,
      alloc: {
        video: 25,
        flashcard: 25,
        dictation: 20,
        shadowing: 10,
        quiz: 10,
        mini_test: 10,
        full_test: 0,
      },
    },
    {
      min: 200,
      max: 400,
      alloc: {
        video: 20,
        flashcard: 20,
        dictation: 25,
        shadowing: 10,
        quiz: 10,
        mini_test: 10,
        full_test: 5,
      },
    },
    {
      min: 400,
      max: 600,
      alloc: {
        video: 15,
        flashcard: 15,
        dictation: 20,
        shadowing: 10,
        quiz: 15,
        mini_test: 15,
        full_test: 10,
      },
    },
    {
      min: 600,
      max: 800,
      alloc: {
        video: 10,
        flashcard: 10,
        dictation: 15,
        shadowing: 10,
        quiz: 15,
        mini_test: 20,
        full_test: 20,
      },
    },
    {
      min: 800,
      max: 990,
      alloc: {
        video: 5,
        flashcard: 5,
        dictation: 10,
        shadowing: 10,
        quiz: 10,
        mini_test: 25,
        full_test: 35,
      },
    },
  ];

  function pickBandAlloc(score?: number): Alloc | undefined {
    if (typeof score !== "number" || isNaN(score)) return undefined;
    for (const row of BAND_TABLE) {
      if (score >= row.min && score < row.max) return row.alloc;
    }
    // Nếu score >= max cuối cùng, dùng hàng cuối
    const last = BAND_TABLE[BAND_TABLE.length - 1];
    if (last && score >= last.max) return last.alloc;
    return undefined;
  }

  const currentScore = Number(plan?.summary?.current_score);
  const bandAlloc = pickBandAlloc(currentScore);

  const totalWeeks = Number(plan?.summary?.total_weeks || 0);
  const fallbackCourse =
    expectedWeekMinutes && totalWeeks > 0
      ? expectedWeekMinutes * totalWeeks
      : undefined;
  const baseMinutes =
    typeof expectedCourseMinutes === "number" && expectedCourseMinutes > 0
      ? expectedCourseMinutes
      : typeof fallbackCourse === "number"
      ? fallbackCourse
      : undefined;

  const useBand = Boolean(
    bandAlloc && typeof baseMinutes === "number" && baseMinutes > 0
  );
  if (useBand) {
    // Phân bổ CHỈ THEO BAND cho expectedByActivity, không cộng chồng với phase
    let sum = 0;
    let maxKey = "";
    let maxVal = -Infinity;
    for (const [act, pct] of Object.entries(bandAlloc!)) {
      const actName = normalizeActivityName(act);
      const minutes = Math.round((baseMinutes! * Number(pct)) / 100);
      expectedByActivity[actName] = minutes;
      sum += minutes;
      if (minutes > maxVal) {
        maxVal = minutes;
        maxKey = actName;
      }
    }
    // Cân sai số do làm tròn để tổng == baseMinutes
    if (
      typeof baseMinutes === "number" &&
      isFinite(sum) &&
      isFinite(baseMinutes)
    ) {
      const delta = baseMinutes - sum;
      if (delta !== 0 && maxKey) {
        expectedByActivity[maxKey] = Math.max(
          0,
          expectedByActivity[maxKey] + delta
        );
      }
    }
  }

  // 2) Tính expectedPerPhase luôn; expectedByActivity chỉ dùng phase methods khi KHÔNG dùng band
  if (Array.isArray(plan?.phase_overview)) {
    plan.phase_overview.forEach((ph: any) => {
      const name = String(ph?.phase || "");
      let phaseMinutes = 0;
      const phaseHours = Number(ph?.hours || 0);
      const pct = Number(ph?.percentage || 0);
      if (phaseHours > 0) phaseMinutes = phaseHours * 60;
      else if (expectedCourseMinutes && pct > 0)
        phaseMinutes = (expectedCourseMinutes * pct) / 100;
      if (name)
        expectedPerPhase[name] =
          (expectedPerPhase[name] || 0) + Math.round(phaseMinutes);

      const methods = ph?.methods || {};
      const methodEntries = Object.entries(methods) as Array<[string, any]>;
      if (!useBand) {
        methodEntries.forEach(([m, v]) => {
          const mpct = Number(v || 0);
          if (mpct > 0 && phaseMinutes > 0) {
            const actName = normalizeActivityName(m);
            expectedByActivity[actName] =
              (expectedByActivity[actName] || 0) +
              Math.round((phaseMinutes * mpct) / 100);
          }
        });
      }
    });
  }

  return {
    expectedDayMinutes,
    expectedWeekMinutes,
    expectedPerPhase,
    expectedByActivity,
    expectedCourseMinutes,
  };
}

export function formatTotalsReport(plan: any) {
  const t = computePlanTotals(plan);
  const exp = computeExpected(plan);
  const lines: string[] = [];
  const add = (s = "") => lines.push(s);

  add("=== BÁO CÁO TỔNG THỜI GIAN KẾ HOẠCH TOEIC ===");
  add("");

  add("[1] Tổng thời gian từng ngày (phút)");
  if (typeof exp.expectedDayMinutes === "number")
    add(`- Kế hoạch mỗi ngày: ${exp.expectedDayMinutes} phút`);
  const dayKeys = Object.keys(t.perDayTotals).sort();
  if (dayKeys.length === 0) add("- (không có dữ liệu ngày)");
  dayKeys.forEach((d) => {
    const actual = t.perDayTotals[d];
    if (typeof exp.expectedDayMinutes === "number") {
      const diff = actual - exp.expectedDayMinutes;
      add(
        `- ${d}: ${actual} (chênh: ${
          diff >= 0 ? "+" + diff : String(diff)
        } phút)`
      );
    } else {
      add(`- ${d}: ${actual}`);
    }
  });
  add("");

  add("[2] Tổng thời gian từng tuần (phút)");
  if (typeof exp.expectedWeekMinutes === "number")
    add(`- Kế hoạch mỗi tuần: ${exp.expectedWeekMinutes} phút`);
  const weekKeys = Object.keys(t.perWeekTotals)
    .map((k) => Number(k))
    .sort((a, b) => a - b);
  if (weekKeys.length === 0) add("- (không có dữ liệu tuần)");
  weekKeys.forEach((w) => {
    const actual = t.perWeekTotals[w];
    if (typeof exp.expectedWeekMinutes === "number") {
      const diff = actual - exp.expectedWeekMinutes;
      add(
        `- Tuần ${w}: ${actual} (chênh: ${
          diff >= 0 ? "+" + diff : String(diff)
        } phút)`
      );
    } else {
      add(`- Tuần ${w}: ${actual}`);
    }
  });
  add("");

  add("[3] Tổng thời gian từng giai đoạn (phút)");
  const phaseKeys = Object.keys(t.perPhaseTotals);
  if (phaseKeys.length === 0) add("- (không có dữ liệu giai đoạn)");
  phaseKeys.forEach((p) => {
    const actual = t.perPhaseTotals[p];
    const expected = exp.expectedPerPhase[p];
    if (typeof expected === "number") {
      const diff = actual - expected;
      add(
        `- ${p}: ${actual} (kế hoạch: ${expected}, chênh: ${
          diff >= 0 ? "+" + diff : String(diff)
        } phút)`
      );
    } else {
      add(`- ${p}: ${actual}`);
    }
  });
  add("");

  add("[4] Tổng thời gian theo hoạt động (phút)");
  const activityKeys = Object.keys(t.byActivityTotals).sort();
  if (activityKeys.length === 0) add("- (không có dữ liệu hoạt động)");
  activityKeys.forEach((a) => {
    const actual = t.byActivityTotals[a];
    const expected = exp.expectedByActivity[a];
    if (typeof expected === "number") {
      const diff = actual - expected;
      add(
        `- ${a}: ${actual} (kế hoạch: ${expected}, chênh: ${
          diff >= 0 ? "+" + diff : String(diff)
        } phút)`
      );
    } else {
      add(`- ${a}: ${actual}`);
    }
  });
  add("");

  add("[5] Tổng thời gian toàn khóa (phút)");
  add(`- Thực tế: ${t.courseTotal}`);
  if (typeof t.expectedCourseMinutes === "number") {
    const diff = t.courseTotal - t.expectedCourseMinutes;
    add(`- Kế hoạch (estimated_hours*60): ${t.expectedCourseMinutes}`);
    add(`- Chênh lệch: ${diff >= 0 ? "+" + diff : String(diff)} phút`);
  }

  return lines.join("\n");
}

export function writeTotalsReport(plan: any, label = "toeic-plan-totals") {
  const report = formatTotalsReport(plan);
  writeTextReport(label, report);
}
