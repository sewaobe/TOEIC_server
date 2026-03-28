# 🎯 TOEIC Weekly Planner - Greedy Scheduler Algorithm (Continuous Fill)

## 📋 Tổng quan

Đây là thuật toán **Greedy Scheduler với Continuous Fill** dùng để sắp xếp các bài học TOEIC vào tuần học một cách tự động, **không cần sử dụng LLM (Large Language Model)**.

### Ưu điểm so với LLM:
| Tiêu chí | LLM (Gemini) | Greedy Algorithm |
|----------|--------------|------------------|
| **Latency** | 3-10 giây | < 100ms |
| **Chi phí** | API cost | Miễn phí |
| **Độ tin cậy** | Có thể fail/timeout | Luôn deterministic |
| **Bảo trì** | Khó debug prompt | Dễ debug code |
| **Kết quả** | Không nhất quán | Cùng input → cùng output |

---

## 🏗️ Kiến trúc thuật toán

```
┌─────────────────────────────────────────────────────────────────┐
│                    INPUT                                        │
├─────────────────────────────────────────────────────────────────┤
│  • candidateItems: Bài học theo Part (từ getCandidateLearningItems)
│  • classifiedParts: weak_parts, medium_parts, strong_parts      │
│  • timeConstraints: minutesPerDay, totalWeekMinutes             │
│  • userProfile: study_days_per_week                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PHASE 1: Tính toán Time Budget                     │
├─────────────────────────────────────────────────────────────────┤
│  • actualStudyDays = study_days_per_week - 1 (trừ ngày test)   │
│  • totalWeekMinutes = actualStudyDays × minutesPerDay          │
│  • weakBudget = totalWeekMinutes × 65% (558 min nếu 143m×6d)   │
│  • mediumBudget = totalWeekMinutes × 25% (214 min)             │
│  • strongBudget = totalWeekMinutes × 10% (86 min)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PHASE 2: Continuous Fill (Weak → Medium → Strong)  │
├─────────────────────────────────────────────────────────────────┤
│  • Ngày 1: Fill từ Weak budget (143 min)                        │
│  • Ngày 2: Tiếp tục Weak (143 min)                              │
│  • Ngày 3: Tiếp tục Weak (143 min)                              │
│  • Ngày 4: Weak (129m) + Medium (14m) ← Chuyển đổi liên tục!   │
│  • Ngày 5: Medium (143 min)                                     │
│  • Ngày 6: Medium (57m) + Strong (86m) ← 1 ngày nhiều nhóm!    │
│  • Ngày 7: Mini Test Only                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PHASE 3: Chọn bài học cho mỗi Part                 │
├─────────────────────────────────────────────────────────────────┤
│  • Theo tỷ lệ PART_ACTIVITY_CONFIG cho từng Part                │
│  • Ưu tiên items có weight cao                                  │
│  • Mỗi item chỉ dùng 1 lần/tuần (usedIds tracking)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PHASE 4: Optimization Loop (+-20 phút)             │
├─────────────────────────────────────────────────────────────────┤
│  • Nếu dư giờ: Bỏ bài priority thấp (Quiz, Vocab weight thấp)  │
│  • Nếu thiếu giờ: Thêm bài priority cao (Lesson, Skills)       │
│  • Loop tối đa 10 lần để đạt [target-20, target+20]            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PHASE 5: Sắp xếp items trong session               │
├─────────────────────────────────────────────────────────────────┤
│  • Interleave pattern: A-B-A hoặc A-B-C                         │
│  • Tránh: A-A-A, A-A-B (2+ items cùng loại liên tiếp)           │
│  • Đảm bảo đa dạng hoạt động                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OUTPUT                                       │
├─────────────────────────────────────────────────────────────────┤
│  • WeeklyPlanOutput với days[] → sessions[] → items[]           │
│  • Metrics đầy đủ để tracking                                   │
│  • debug_log cho monitoring                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📅 Cấu trúc tuần học (Continuous Fill Logic)

### Logic mới:
**Không còn cố định ngày cho từng nhóm!** Thay vào đó, fill liên tục dựa trên budget.

| Ví dụ với 143 phút/ngày × 6 ngày | Budget | Thực tế fill |
|----------------------------------|--------|--------------|
| **Weak Parts (65%)** | 558 min | Ngày 1-3 đầy, Ngày 4 một phần (~3.9 ngày) |
| **Medium Parts (25%)** | 214 min | Ngày 4 (phần còn lại) + Ngày 5 (~1.5 ngày) |
| **Strong Parts (10%)** | 86 min | Ngày 6 (phần còn lại) (~0.6 ngày) |

### Sample Output (143 min/day):

| Ngày | Thực tế | Parts học | Giải thích |
|------|---------|-----------|------------|
| **Thứ 2** | 143 min | Weak (Part 4, 7, 5) | Fill từ Weak budget |
| **Thứ 3** | 143 min | Weak (Part 4, 7, 5) | Tiếp tục Weak |
| **Thứ 4** | 143 min | Weak (Part 4, 7, 5) | Tiếp tục Weak |
| **Thứ 5** | 129m + 14m | **Weak (129m)** + **Medium (14m)** | 🔄 Chuyển đổi! |
| **Thứ 6** | 143 min | Medium (Part 6, 1) | Tiếp tục Medium |
| **Thứ 7** | 57m + 86m | **Medium (57m)** + **Strong (86m)** | 🔄 Chuyển đổi! |
| **Chủ nhật** | Test | - | Mini Test đánh giá |

### Phân bổ thời gian:
- **Weak Parts**: 65% tổng thời gian tuần (558/858 min)
- **Medium Parts**: 25% tổng thời gian tuần (214/858 min)
- **Strong Parts**: 10% tổng thời gian tuần (86/858 min)

---

## 📚 Loại bài học đặc trưng theo Part

### PART_ACTIVITY_CONFIG

```typescript
const PART_ACTIVITY_CONFIG = {
  // LISTENING (Part 1-4)
  1: { vocab: 0.40, dictation: 0.40, quiz: 0.20 },     // Mô tả hình ảnh
  2: { dictation: 0.50, shadowing: 0.30, quiz: 0.20 }, // Hỏi đáp ngắn
  3: { shadowing: 0.35, dictation: 0.30, lesson: 0.20, quiz: 0.15 }, // Hội thoại
  4: { shadowing: 0.35, dictation: 0.30, lesson: 0.20, quiz: 0.15 }, // Bài nói

  // READING (Part 5-7)  
  5: { vocab: 0.40, lesson: 0.40, quiz: 0.20 },        // Điền câu (ngữ pháp)
  6: { lesson: 0.50, vocab: 0.30, quiz: 0.20 },        // Điền đoạn
  7: { lesson: 0.50, vocab: 0.30, quiz: 0.20 },        // Đọc hiểu
};
```

### Giải thích logic:

| Part | Kỹ năng | Loại bài chính | Lý do |
|------|---------|----------------|-------|
| **Part 1** | Listening - Hình ảnh | Vocab + Dictation | Cần nhận diện từ vựng mô tả |
| **Part 2** | Listening - Hỏi đáp | Dictation + Shadowing | Nghe câu ngắn, phản xạ nhanh |
| **Part 3** | Listening - Hội thoại | Shadowing + Dictation | Nghe hội thoại dài, bắt ý |
| **Part 4** | Listening - Độc thoại | Shadowing + Dictation | Nghe bài nói liên tục |
| **Part 5** | Reading - Điền câu | Vocab + Lesson | Ngữ pháp + từ vựng |
| **Part 6** | Reading - Điền đoạn | Lesson + Vocab | Đọc hiểu ngữ cảnh |
| **Part 7** | Reading - Đọc hiểu | Lesson + Vocab | Đọc hiểu bài dài |

---

## 🔧 Các hàm chính

### 1. `generateWeeklyPlanGreedy(input)`
**Main function** - Tạo kế hoạch tuần học theo Continuous Fill Logic.

```typescript
function generateWeeklyPlanGreedy(input: {
  userProfile: { current_week, study_days_per_week };
  candidateItems: Record<number, LearningItem[]>;
  miniTest: { _id, estimated_time };
  classifiedParts: ClassifiedParts;
  timeConstraints: TimeConstraints;
}): WeeklyPlanOutput
```

**Logic**:
- Tính `actualStudyDays = study_days_per_week - 1` (trừ ngày test)
- Tính `totalWeekMinutes = actualStudyDays × minutesPerDay`
- Tạo `groupQueue` với budget: Weak (65%), Medium (25%), Strong (10%)
- Fill từng ngày liên tục cho đến khi hết budget của từng group
- 1 ngày có thể học nhiều group nếu group trước hết budget

### 2. `createDayPlan(pool, dayIndex, dayType, partsToStudy, targetMinutes, usedIds)`

Logic mới fill trực tiếp trong `generateWeeklyPlanGreedy` theo từng ngày.

### 3. `selectItemsForPart(pool, part, targetMinutes, usedIds)`
Chọn items cho 1 Part theo tỷ lệ activity trong `PART_ACTIVITY_CONFIG`.

**Cách hoạt động**:
- Sắp xếp activities theo tỷ lệ giảm dần
- Với mỗi activity: `targetForActivity = targetMinutes × ratio`
- Chọn items có weight cao nhất chưa được dùng
- Mark items đã chọn vào `usedIds` (mỗi item chỉ dùng 1 lần/tuần)

### 4. `interleaveItems(items)`
Sắp xếp items để đảm bảo đa dạng (A-B-A pattern).

**Pattern tránh**:
- ❌ A-A-A (3 items cùng loại liên tiếp)
- ❌ A-A-B (2 items cùng loại liên tiếp)
- ✅ A-B-A (xen kẽ)
- ✅ A-B-C (đa dạng)

### 5. `getItemPriority(item)` & `getItemPriorityByKind(kind)`
Tính độ ưu tiên của item dựa trên loại và weight (dùng cho Optimization Loop).

**Priority Score**:
```
typeScore:
  - lesson: 5 (quan trọng nhất - lý thuyết)
  - dictation/shadowing: 4 (kỹ năng thực hành)
  - vocab: 3 (từ vựng nền tảng)
  - quiz: 2 (kiểm tra - có thể giảm)

finalScore = typeScore + (weight × 10)
=> Range: 2-15
```

### 6. `calculateSchedulerMetrics(days, classifiedParts, totalWeekMinutes, minutesPerDay)`
Tính metrics để monitoring.

**Metrics tính toán**:
- `time_allocation`: So sánh target vs actual cho từng group
- `daily_breakdown`: Chi tiết thời gian từng ngày
- `part_coverage`: Tổng thời gian và số sessions cho từng Part
- `constraints_satisfied`: Kiểm tra weak_actual >= weak_target × 80%

---

## 📊 Metrics & Monitoring

### Cấu trúc SchedulerMetrics:

```typescript
interface SchedulerMetrics {
  time_allocation: {
    weak_target: number;    // Target phút cho weak parts
    weak_actual: number;    // Thực tế
    medium_target: number;
    medium_actual: number;
    strong_target: number;
    strong_actual: number;
  };
  
  daily_breakdown: {
    day_index: number;
    day_type: string;
    target_minutes: number;
    actual_minutes: number;
    parts_covered: number[];
    activities: Record<string, number>;
  }[];
  
  part_coverage: {
    part: number;
    group: string;           // "weak" | "medium" | "strong"
    total_minutes: number;
    sessions_count: number;
  }[];
  
  constraints_satisfied: boolean;
}
```

### Sample Output Report:

```
╔══════════════════════════════════════════════════════════════╗
║     📊 WEEK 6 - GREEDY SCHEDULER METRICS REPORT              ║
╠══════════════════════════════════════════════════════════════╣
║ ⏱️  TIME ALLOCATION                                          ║
╠──────────────────────────────────────────────────────────────╣
║  Weak Parts:   570/558 min  (target: 65%)                    ║
║  Medium Parts: 225/215 min  (target: 25%)                    ║
║  Strong Parts: 105/86 min  (target: 10%)                    ║
╠══════════════════════════════════════════════════════════════╣
║ 📅 DAILY BREAKDOWN                                           ║
╠──────────────────────────────────────────────────────────────╣
║  Day 1 [weak  ]: 155/143 min | Parts: [5,7,4]
║    └─ vocab:60m, quiz:10m, lesson:60m, shadowing:15m, dictation:10m
║  Day 2 [weak  ]: 155/143 min | Parts: [5,7,4]
║    └─ vocab:60m, quiz:10m, lesson:60m, shadowing:15m, dictation:10m
║  Day 3 [weak  ]: 155/143 min | Parts: [5,7,4]
║    └─ vocab:60m, quiz:10m, lesson:60m, shadowing:15m, dictation:10m
║  Day 4 [medium]: 145/143 min | Parts: [5,7,4,1,2]
║    └─ vocab:90m, quiz:10m, lesson:20m, shadowing:15m, dictation:10m
║  Day 5 [medium]: 130/143 min | Parts: [1,2]
║    └─ vocab:30m, quiz:30m, dictation:40m, shadowing:30m
║  Day 6 [strong]: 160/143 min | Parts: [1,2,3,6]
║    └─ vocab:60m, dictation:30m, shadowing:30m, lesson:40m
║  Day 7 [test  ]:   0/143 min | Parts: [-]
║    └─ mini-test only
╠══════════════════════════════════════════════════════════════╣
║ 📈 PART COVERAGE                                             ║
╠──────────────────────────────────────────────────────────────╣
║  Part 5 [weak  ]: 160 min | 4 sessions
║  Part 7 [weak  ]: 260 min | 4 sessions
║  Part 4 [weak  ]: 150 min | 4 sessions
║  Part 1 [medium]: 110 min | 3 sessions
║  Part 2 [medium]: 115 min | 3 sessions
║  Part 3 [strong]:  55 min | 1 sessions
║  Part 6 [strong]:  50 min | 1 sessions
╠══════════════════════════════════════════════════════════════╣
║ ✅ CONSTRAINTS: ALL SATISFIED ✓                              ║
╚══════════════════════════════════════════════════════════════╝
```

**Giải thích**:
- Week 6 với 143 phút/ngày × 6 ngày thực = 858 phút tổng
- Weak actual (570) ≈ 102% target (558) ✓
- Medium actual (225) ≈ 103% target (âằ) ✓
- Strong actual (105) ≈ 110% target (86) ✓
- Tất cả Parts đều có coverage → Constraints Satisfied

---

## 🔄 Flow tích hợp trong `generateIRTWeeklyPlanService`

```
┌─────────────────────────────────────────────────────────────────┐
│  Bước 1: submitMiniTestService() - Tính điểm test              │
│  Bước 2: calculateThetaRasch() - Tính theta từng Part          │
│  Bước 3: generateNextWeekMiniTest() - Tạo mini test tuần sau   │
│  Bước 4: getCandidateLearningItems() - Lấy bài học phù hợp     │
│  Bước 5: normalizeCandidateItems() - Chuẩn hóa data            │
│  Bước 6: generateWeeklyPlanGreedy() - 🎯 GREEDY SCHEDULER      │
│  Bước 7: Map to WeekStudy & DayStudy - Lưu DB                  │
│  Bước 8: Update theta in DB                                     │
│  Bước 9: Update streak                                          │
│  Bước 10: Auto unlock activities                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ Cấu hình có thể điều chỉnh

### WEEK_SCHEDULE_CONFIG

```typescript
const WEEK_SCHEDULE_CONFIG = {
  weak_time_ratio: 0.65,     // 65% thời gian tuần cho weak parts
  medium_time_ratio: 0.25,   // 25% thời gian tuần cho medium parts
  strong_time_ratio: 0.10,   // 10% thời gian tuần cho strong parts
};
```

**Lưu ý**: 
- ❌ Không còn `weak_days`, `medium_days`, `strong_days` (logic cũ)
- ✅ Chỉ cần tỷ lệ thời gian, thuật toán tự fill liên tục

### Estimated Study Time

```typescript
function estimateStudyTime(kind: string) {
  switch (kind) {
    case "quiz": return 10;      // 10 phút
    case "lesson": return 20;    // 20 phút
    case "vocab": return 30;     // 30 phút
    case "dictation": return 10; // 10 phút
    case "shadowing": return 15; // 15 phút
    default: return 10;
  }
}
```

### Optimization Loop Settings

```typescript
const minTarget = targetMinutes - 20;  // Cho phép thiếu tối đa 20 phút
const maxTarget = targetMinutes + 20;  // Cho phép dư tối đa 20 phút
const MAX_ITER = 10;                   // Tối đa 10 lần điều chỉnh
```

---

## 🎯 Ví dụ cụ thể (Continuous Fill)

### Input:
- **User**: Học 143 phút/ngày, 7 ngày/tuần
- **Tổng thời gian**: (7-1) × 143 = **858 phút** (6 ngày học thực)
- **Theta by Part**: Part 7 (-1.87), Part 4 (-1.47), Part 5 (-1.39), Part 1 (0.2), Part 6 (1.55), Part 2 (4.0), Part 3 (4.0)
- **Classified Parts**:
  - **Weak**: [4, 7, 5] (theta thấp nhất) → Budget: 558 min (65%)
  - **Medium**: [6, 1] → Budget: 214 min (25%)
  - **Strong**: [2, 3] → Budget: 86 min (10%)

### Output (Continuous Fill):

#### **Ngày 1 (Thứ 2) - Weak Phase**
- **Time**: 210 min (target: 143, tolerance: ±20)
- **Group**: Weak (remaining: 558 - 210 = 348 min)
- **Sessions**:
  - Part 4: shadowing(15m), dictation(15m), lesson(10m), quiz(5m) = 45m
  - Part 7: lesson(30m), vocab(30m), quiz(5m) = 65m
  - Part 5: vocab(40m), lesson(40m), quiz(20m) = 100m

#### **Ngày 2 (Thứ 3) - Weak Phase**
- **Time**: 210 min
- **Group**: Weak (remaining: 348 - 210 = 138 min)
- Similar structure...

#### **Ngày 3 (Thứ 4) - Weak Phase**
- **Time**: 210 min
- **Group**: Weak (remaining: 138 - 210 = -72, hết budget!)
- Chỉ fill 138 min Weak, còn lại 72 min trống

#### **Ngày 4 (Thứ 5) - 🔄 Transition Day (Weak → Medium)**
- **Time**: 138m (Weak) + 72m (Medium) = 210 min
- **Group**: 
  - Weak hết budget (0 min remaining) ✓
  - Medium bắt đầu (remaining: 214 - 72 = 142 min)
- **Sessions**:
  - Part 4, 7, 5: Weak items (138m)
  - Part 6, 1: Medium items (72m) ← **Chuyển đổi trong cùng ngày!**

#### **Ngày 5 (Thứ 6) - Medium Phase**
- **Time**: 142 min
- **Group**: Medium (remaining: 142 - 142 = 0, hết budget!)
- Sessions với Part 6, 1

#### **Ngày 6 (Thứ 7) - 🔄 Strong Phase (+ Medium nếu còn)**
- **Time**: 86 min (Strong)
- **Group**: Strong (remaining: 86 - 86 = 0, hết budget!)
- Sessions với Part 2, 3

#### **Ngày 7 (Chủ nhật) - Test Day**
- **Mini Test Only** (30 phút)

### Kết quả Metrics:
```
Weak actual:   558/558 min (100% ✓)
Medium actual: 214/214 min (100% ✓)
Strong actual:  86/ 86 min (100% ✓)
```

---

## 📝 Ghi chú

1. **Deterministic**: Thuật toán luôn cho cùng kết quả với cùng input
2. **Continuous Fill**: 1 ngày có thể học nhiều nhóm (weak + medium hoặc medium + strong)
3. **Flexible**: Không cố định ngày cho từng nhóm, tự động điều chỉnh dựa trên budget
4. **Optimized**: Optimization Loop (±20 phút) đảm bảo mỗi ngày đạt target
5. **Pedagogical**: Priority system ưu tiên Lesson > Skills > Vocab > Quiz
6. **Extensible**: Dễ dàng thêm rules mới vào `PART_ACTIVITY_CONFIG`
7. **Debuggable**: Metrics report chi tiết giúp tracking và debug
8. **Performance**: O(n) với n là số items, chạy trong < 100ms

### Các cải tiến so với phiên bản cũ:

| Feature | Old (Fixed Days) | New (Continuous Fill) |
|---------|------------------|----------------------|
| **Ngày học/nhóm** | Cố định (1-3, 4-5, 6) | Linh hoạt (fill đến hết budget) |
| **1 ngày/nhiều nhóm** | ❌ Không | ✅ Có (transition days) |
| **Đạt target** | 480/651 (73%) | 558/558 (100%) |
| **Time allocation** | Lệch vì chia cứng | Chính xác theo % |
| **Optimization** | Chưa có | ✅ Loop ±20 phút |

---

## 🔑 Key Takeaways

1. **Tổng thời gian tuần** = `(study_days - 1) × minutesPerDay`
   - Trừ 1 ngày test
   - Ví dụ: (7-1) × 143 = 858 phút

2. **Budget cho từng nhóm**:
   - Weak: 858 × 65% = 558 min (~3.9 ngày)
   - Medium: 858 × 25% = 214 min (~1.5 ngày)
   - Strong: 858 × 10% = 86 min (~0.6 ngày)

3. **Fill liên tục**:
   - Học Weak cho đến khi hết 558 min
   - Chuyển sang Medium trong cùng ngày nếu cần
   - Không lãng phí thời gian học

4. **Optimization Loop**:
   - Đảm bảo mỗi ngày trong khoảng [target-20, target+20]
   - Dư giờ: bỏ Quiz/Vocab priority thấp
   - Thiếu giờ: thêm Lesson/Skills priority cao

---

*Tài liệu được tạo ngày: 31/01/2026*
