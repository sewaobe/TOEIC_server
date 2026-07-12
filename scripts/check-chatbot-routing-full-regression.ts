import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { CHAT_INTENT_EXAMPLES } from "../src/services/chat_intent_examples.data";
import { routeChatMessage } from "../src/services/chat_intent_router.service";
import {
  ChatConversationState,
  ChatIntent,
  ChatRouteContext,
  ChatRouteDecision,
} from "../src/types/chat.types";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPORT_DIR = path.resolve(__dirname, "../../doc/docs/chatbot-routing-regression");
const REPORT_FILES = {
  summary: path.join(REPORT_DIR, "full-regression-summary.json"),
  passed: path.join(REPORT_DIR, "full-regression-passed.json"),
  failed: path.join(REPORT_DIR, "full-regression-failed.json"),
  markdown: path.join(REPORT_DIR, "full-regression-report.md"),
};

type ExpectedLabel = ChatIntent | "clarify" | "clarify_with_options" | "gemini_fallback" | "safe_fallback";

type RoutingRegressionCase = {
  id: string;
  group: string;
  input: string;
  contextType: keyof typeof CONTEXTS;
  expectedIntent?: ExpectedLabel;
  expectedIntentOneOf?: ExpectedLabel[];
  forbiddenIntents?: ExpectedLabel[];
  expectChromaQueried?: boolean;
  expectChromaAvailable?: boolean;
  expectReasonCode?: string;
  forceChromaError?: boolean;
  notes?: string;
};

type RoutingCaseResult = {
  id: string;
  group: string;
  input: string;
  contextType: string;
  context: Record<string, unknown>;
  expectedIntent?: ExpectedLabel;
  expectedIntentOneOf?: ExpectedLabel[];
  forbiddenIntents?: ExpectedLabel[];
  actualIntent: string;
  actualConfidence?: number;
  routeSource?: string;
  chromaQueried?: boolean;
  chromaAvailable?: boolean;
  reasonCodes?: string[];
  diagnostics?: unknown;
  passed: boolean;
  failureReason?: string;
  notes?: string;
  likelyCause?: string;
  suggestedFix?: string;
  decision?: ChatRouteDecision["kind"];
};

const TEST_IDS = {
  testId: "507f1f77bcf86cd799439010",
  questionId: "507f1f77bcf86cd799439011",
  attemptId: "507f1f77bcf86cd799439012",
  dictationAttemptId: "507f1f77bcf86cd799439013",
  shadowingAttemptId: "507f1f77bcf86cd799439014",
};

const CONTEXTS = {
  none: {
    routeContext: { page: "dashboard" } as ChatRouteContext,
  },
  attemptOnly: {
    routeContext: {
      page: "test_result",
      testId: TEST_IDS.testId,
      attemptId: TEST_IDS.attemptId,
    } as ChatRouteContext,
  },
  fullQuestion: {
    routeContext: {
      page: "question_review",
      testId: TEST_IDS.testId,
      attemptId: TEST_IDS.attemptId,
      questionId: TEST_IDS.questionId,
      currentQuestionNumber: 12,
    } as ChatRouteContext,
  },
  questionOnly: {
    routeContext: {
      page: "question_review",
      questionId: TEST_IDS.questionId,
      currentQuestionNumber: 12,
    } as ChatRouteContext,
  },
  roadmapState: {
    routeContext: { page: "roadmap" } as ChatRouteContext,
    conversationState: { scope: "overall_progress", intent: "roadmap.summary" } as ChatConversationState,
  },
  questionState: {
    routeContext: { page: "question_review" } as ChatRouteContext,
    conversationState: {
      scope: "single_question",
      intent: "question.explain_specific",
      questionId: TEST_IDS.questionId,
      attemptId: TEST_IDS.attemptId,
    } as ChatConversationState,
  },
  attemptState: {
    routeContext: { page: "test_result" } as ChatRouteContext,
    conversationState: {
      scope: "attempt_analysis",
      intent: "test_attempt.analysis",
      attemptId: TEST_IDS.attemptId,
    } as ChatConversationState,
  },
  dictation: {
    routeContext: {
      page: "dictation",
      dictationAttemptId: TEST_IDS.dictationAttemptId,
    } as ChatRouteContext,
  },
};

const cases: RoutingRegressionCase[] = [];

function addCase(testCase: Omit<RoutingRegressionCase, "id"> & { id?: string }) {
  const id = testCase.id ?? `R${String(cases.length + 1).padStart(4, "0")}`;
  cases.push({ ...testCase, id });
}

function addMany(
  group: string,
  inputs: string[],
  config: Omit<RoutingRegressionCase, "id" | "group" | "input">
) {
  inputs.forEach((input) => addCase({ group, input, ...config }));
}

function expectedForIntent(intentId: ChatIntent): ExpectedLabel {
  return intentId;
}

function contextTypeForIntent(intentId: ChatIntent): keyof typeof CONTEXTS {
  if (
    intentId === "question.explain_specific" ||
    intentId === "question.translate_context" ||
    intentId === "question.similar_practice" ||
    intentId === "vocabulary.contextual" ||
    intentId === "grammar.contextual"
  ) {
    return "fullQuestion";
  }
  if (intentId === "test_attempt.analysis") return "attemptOnly";
  if (intentId === "listening_practice.analysis") return "dictation";
  return "none";
}

const seedCounts: Partial<Record<ChatIntent, number>> = {
  "out_of_project.general": 10,
  "smalltalk.greeting_feedback": 10,
  "user_profile.identity": 8,
  "user_progress.summary": 10,
  "user_progress.ability_map": 8,
  "test_attempt.analysis": 15,
  "question.explain_specific": 15,
  "question.translate_context": 10,
  "question.similar_practice": 8,
  "vocabulary.contextual": 10,
  "grammar.contextual": 10,
  "toeic_knowledge.general": 12,
  "roadmap.guidance": 6,
  "roadmap.summary": 6,
  "roadmap.next_step": 6,
  "roadmap.explain_recommendation": 6,
  "roadmap.adjust": 5,
  "flashcard.create": 8,
  "flashcard.personal": 6,
  "app.navigation_support": 8,
};

for (const entry of CHAT_INTENT_EXAMPLES) {
  if (entry.availability === "DISABLED") {
    continue;
  }
  const limit = seedCounts[entry.intentId] ?? 5;
  entry.examples.slice(0, limit).forEach((input, index) => {
    addCase({
      group: `catalog seed: ${entry.intentId}`,
      input,
      contextType: contextTypeForIntent(entry.intentId),
      expectedIntent: expectedForIntent(entry.intentId),
      notes: `catalog example ${index + 1}`,
    });
  });
}

addMany("smalltalk / conversational", [
  "hey bot",
  "hello",
  "hi",
  "chào bạn",
  "ok",
  "oke",
  "ừm được rồi",
  "cảm ơn",
  "thanks",
  "thanks a lot",
  "tạm biệt",
  "học TOEIC khó quá",
  "mình đang bị rối quá",
  "tôi hơi nản",
  "giúp tôi với",
  "tôi không biết bắt đầu từ đâu",
], {
  contextType: "none",
  expectedIntent: "smalltalk.greeting_feedback",
  forbiddenIntents: ["user_progress.summary", "test_attempt.analysis"],
});

addMany("hard out-of-scope", [
  "bitcoin giá bao nhiêu",
  "giá vàng hôm nay",
  "thời tiết hôm nay thế nào",
  "bóng đá tối nay ai đá",
  "viết code Python cho tôi",
  "nấu phở như thế nào",
  "tư vấn thuốc đau đầu",
  "tôi bị sốt uống thuốc gì",
  "tin chính trị mới nhất",
  "mua laptop nào tốt",
  "dự đoán chứng khoán hôm nay",
  "lịch chiếu phim hôm nay",
  "kể chuyện ma đi",
  "viết thơ tình cho tôi",
  "đặt vé máy bay đi Đà Nẵng",
], {
  contextType: "none",
  expectedIntent: "out_of_project.general",
  expectChromaQueried: true,
  forbiddenIntents: ["user_progress.summary", "toeic_knowledge.general", "roadmap.guidance", "test_attempt.analysis", "gemini_fallback"],
});

addMany("out-of-scope false positive guard", [
  "dịch câu này",
  "giải thích giúp tôi",
  "câu này sao vậy",
  "TOEIC Part 5 là gì",
  "tôi yếu kỹ năng nào",
  "tạo flashcard từ các từ sai",
  "mở lộ trình học",
], {
  contextType: "fullQuestion",
  forbiddenIntents: ["safe_fallback"],
});

addMany("user profile identity", [
  "toi la ai",
  "toi la ai tren he thong",
  "ban dang biet gi ve toi",
  "thong tin account cua toi",
  "email dang dang nhap la gi",
  "ten hien thi cua toi la gi",
  "toi dang dung tai khoan nao",
  "profile cua toi co gi",
], {
  contextType: "none",
  expectedIntent: "user_profile.identity",
  expectChromaQueried: true,
  forbiddenIntents: ["smalltalk.greeting_feedback", "user_progress.summary", "out_of_project.general"],
});

addMany("user profile identity negative guard", [
  "toi la ai trong cuoc doi nay",
  "toi yeu phan nao",
  "tien do cua toi",
  "diem gan nhat cua toi",
  "lo trinh cua toi",
  "doi ten tai khoan",
  "doi mat khau",
], {
  contextType: "none",
  forbiddenIntents: ["user_profile.identity"],
});

addMany("unknown in-domain / gemini fallback", [
  "toi hoc mai khong len diem thi sao",
  "nen hoc kieu nao cho do chan",
  "giai thich de hieu hon di",
  "toi cam thay mat dinh huong khi hoc TOEIC",
  "nen sap xep thoi gian hoc sao cho do qua tai",
], {
  contextType: "none",
  expectedIntent: "gemini_fallback",
  expectChromaQueried: true,
  forbiddenIntents: ["safe_fallback", "out_of_project.general"],
});

addMany("chroma error fail closed", [
  "hi",
  "hello",
  "chán quá",
  "lộ trình của tôi",
  "câu này làm thế nào",
  "tôi yếu kỹ năng nào",
  "bitcoin giá bao nhiêu",
], {
  contextType: "none",
  expectedIntent: "safe_fallback",
  expectChromaQueried: true,
  expectChromaAvailable: false,
  expectReasonCode: "semantic_router_unavailable",
  forceChromaError: true,
  forbiddenIntents: [
    "smalltalk.greeting_feedback",
    "roadmap.summary",
    "roadmap.guidance",
    "question.explain_specific",
    "user_progress.summary",
    "user_progress.ability_map",
    "out_of_project.general",
    "gemini_fallback",
  ],
});

addMany("toeic general knowledge", [
  "TOEIC là gì",
  "TOEIC Part 5 là gì",
  "Part 7 nên làm thế nào",
  "cách cải thiện listening",
  "mẹo làm Part 2",
  "collocation là gì",
  "relative clause là gì",
  "làm sao tăng điểm TOEIC",
  "cách học từ vựng TOEIC",
  "nên luyện reading thế nào",
  "ngữ pháp nào hay gặp trong TOEIC",
  "Ban giai thich format de thi TOEIC cho minh",
  "Nen luyen de thi TOEIC bao nhieu lan moi tuan",
  "phân biệt although và despite",
  "cách làm câu incomplete sentence",
  "cách làm text completion",
], {
  contextType: "none",
  expectedIntent: "toeic_knowledge.general",
  forbiddenIntents: ["safe_fallback"],
});

addMany("app navigation", [
  "làm bài test ở đâu",
  "vào đâu để luyện đề",
  "xem câu sai ở đâu",
  "review câu sai",
  "dashboard ở đâu",
  "mở trang luyện tập",
  "xem tiến độ học ở đâu",
  "xem lịch sử làm bài ở đâu",
  "đi tới trang kết quả",
  "xem chi tiết bài làm ở đâu",
  "Lam de thi moi o muc nao trong app",
], {
  contextType: "none",
  expectedIntent: "app.navigation_support",
  forbiddenIntents: ["question.explain_specific", "user_progress.summary"],
});
addMany("app navigation: feature-specific", [
  "vào phần flashcard",
  "mở phần từ vựng",
], {
  contextType: "none",
  expectedIntent: "flashcard.personal",
});
addMany("app navigation: roadmap", [
  "mở phần lộ trình",
  "tôi muốn xem roadmap",
], {
  contextType: "none",
  expectedIntent: "roadmap.guidance",
});

addMany("roadmap", [
  "mở lộ trình học",
  "xem roadmap của tôi",
  "lộ trình học ở đâu",
  "đi tới roadmap",
  "hôm nay tôi nên học gì trong lộ trình",
  "bước tiếp theo trong roadmap là gì",
  "tôi đang ở đâu trong lộ trình",
  "roadmap của tôi còn bao nhiêu bước",
  "gợi ý bài học tiếp theo",
  "tôi nên học Part nào tiếp theo",
  "điều chỉnh lộ trình cho tôi",
  "tôi muốn đổi mục tiêu học",
], {
  contextType: "none",
  expectedIntentOneOf: [
    "roadmap.guidance",
    "roadmap.summary",
    "roadmap.next_step",
    "roadmap.adjust",
    "roadmap.explain_recommendation",
  ],
  forbiddenIntents: ["question.explain_specific", "test_attempt.analysis"],
});

addMany("flashcard create", [
  "tạo flashcard cho tôi",
  "tạo flashcard từ các từ sai",
  "thêm từ này vào flashcard",
  "lưu từ này vào flashcard",
  "tạo thẻ từ vựng",
  "tao cho toi 10 tu chu de cau nay",
  "tao 10 tu vung lien quan den cau nay",
  "luu cac tu kho cua cau nay thanh flashcard",
  "sinh bo tu vung tu cau nay de hoc",
  "make flashcards from my mistakes",
  "add this word to flashcard",
  "tạo flashcard cho các từ tôi hay sai",
  "tạo bộ flashcard từ bài vừa làm",
  "lưu vocab này",
], {
  contextType: "fullQuestion",
  expectedIntent: "flashcard.create",
  expectChromaQueried: true,
  forbiddenIntents: ["vocabulary.contextual"],
});

addMany("flashcard review/status", [
  "ôn flashcard hôm nay",
  "tôi có flashcard nào đến hạn không",
  "xem flashcard cần ôn",
  "từ nào tôi hay quên",
  "flashcard đã mastered bao nhiêu",
  "hôm nay cần ôn bao nhiêu từ",
  "từ nào sắp quên",
  "xem trạng thái flashcard của tôi",
  "tôi đã học bao nhiêu flashcard",
  "ôn lại từ vựng yếu",
], {
  contextType: "none",
  expectedIntentOneOf: ["flashcard.personal", "clarify", "gemini_fallback", "safe_fallback"],
  forbiddenIntents: ["flashcard.create", "question.explain_specific"],
  notes: "catalog only has flashcard.create and flashcard.personal; no status/review resolver intent",
});

addMany("attempt analysis current", [
  "phân tích bài vừa làm",
  "xem kết quả bài vừa làm",
  "bài test hiện tại của tôi thế nào",
  "phân tích attempt hiện tại",
  "tôi vừa làm sai gì",
  "kết quả bài làm này ra sao",
  "phân tích bài làm này",
  "đánh giá bài vừa rồi",
  "bài vừa rồi yếu part nào",
  "xem lỗi trong bài vừa làm",
  "phân tích đề tôi vừa làm",
  "review bài test này",
  "de thi nay toi sai nhieu khong",
  "phan tich de thi nay",
], {
  contextType: "attemptOnly",
  expectedIntent: "test_attempt.analysis",
  forbiddenIntents: ["user_progress.summary", "user_progress.ability_map"],
});

addMany("attempt analysis latest", [
  "phân tích bài gần nhất",
  "xem kết quả test gần nhất",
  "đề gần nhất của tôi thế nào",
  "lần làm gần nhất sai gì",
  "bài test mới nhất của tôi",
  "latest attempt analysis",
  "phân tích attempt mới nhất",
  "xem bài làm gần đây nhất",
  "review lần làm gần nhất",
  "kết quả gần nhất của tôi",
  "phan tich de thi gan nhat cua toi",
  "de thi gan nhat cua toi the nao",
], {
  contextType: "none",
  expectedIntent: "test_attempt.analysis",
});

addMany("attempt history/detail", [
  "lịch sử làm bài của tôi",
  "tôi đã làm những đề nào",
  "xem các lần làm bài trước",
  "so sánh các lần làm bài",
  "điểm của tôi qua từng lần làm",
  "bài nào tôi làm tệ nhất",
  "xem attempt cũ",
], {
  contextType: "none",
  expectedIntentOneOf: ["test_attempt.analysis", "user_progress.summary", "app.navigation_support", "clarify", "gemini_fallback"],
  forbiddenIntents: ["question.explain_specific", "toeic_knowledge.general"],
  notes: "no dedicated attempt history intent in catalog",
});

addMany("global progress / ability", [
  "tôi yếu kỹ năng nào",
  "part nào yếu nhất của tôi",
  "khả năng reading listening của tôi ra sao",
  "tình trạng học tập hiện tại ra sao",
  "năng lực TOEIC của tôi thế nào",
  "tôi đang yếu reading hay listening",
  "bản đồ năng lực của tôi",
  "ước tính điểm hiện tại của tôi",
  "tôi cần cải thiện kỹ năng nào",
  "tổng quan tiến độ học tập của tôi",
  "tôi đã hoàn thành bao nhiêu bài",
  "tiến độ học của tôi sao rồi",
  "điểm mạnh điểm yếu của tôi là gì",
  "tôi nên tập trung kỹ năng nào",
  "hiện tại tôi đang ở level nào",
], {
  contextType: "none",
  expectedIntentOneOf: ["user_progress.summary", "user_progress.ability_map"],
  forbiddenIntents: ["test_attempt.analysis"],
});

addMany("question explain with context", [
  "giải thích câu này",
  "giải thích đáp án giúp tôi",
  "vì sao đáp án đúng là B",
  "tại sao không chọn A",
  "sao A sai",
  "đáp án đúng dựa vào đâu",
  "phân tích từng lựa chọn câu này",
  "giải thích đáp án B giúp tôi",
  "lựa chọn C sai ở đâu",
  "câu này bẫy chỗ nào",
  "logic chọn đáp án là gì",
  "why is B correct",
  "why not A",
  "explain this question",
], {
  contextType: "fullQuestion",
  expectedIntent: "question.explain_specific",
  forbiddenIntents: ["safe_fallback", "toeic_knowledge.general"],
});

addMany("question grammar with context", [
  "câu này dùng thì gì",
  "cấu trúc ngữ pháp câu này là gì",
  "mẫu câu này là gì",
  "đây là mệnh đề gì",
  "tại sao dùng V-ing ở đây",
  "tại sao dùng to V",
  "loại từ cần điền là gì",
  "chỗ trống cần danh từ hay tính từ",
  "grammar câu này",
  "analyze grammar",
  "what grammar point is used here",
], {
  contextType: "fullQuestion",
  expectedIntent: "grammar.contextual",
  forbiddenIntents: ["safe_fallback", "toeic_knowledge.general"],
});

addMany("question vocabulary with context", [
  "từ này nghĩa là gì",
  "từ này dùng sao",
  "cho tôi vocab câu này",
  "từ nào quan trọng trong câu này",
  "collocation trong câu này là gì",
  "cụm từ này nghĩa là gì",
  "keyword của câu này là gì",
  "paraphrase trong câu này là gì",
  "synonym của từ này là gì",
  "liet ke tu vung trong cau nay",
  "giai thich tu significant trong cau nay",
  "explain vocabulary in this sentence",
], {
  contextType: "fullQuestion",
  expectedIntent: "vocabulary.contextual",
  forbiddenIntents: ["safe_fallback", "flashcard.create"],
});

addMany("question translate with context", [
  "dịch câu này",
  "dịch sang tiếng Việt",
  "câu này nghĩa tiếng Việt là gì",
  "translate this sentence",
  "dịch đoạn này giúp tôi",
  "dịch đáp án này",
  "dịch cả câu hỏi và đáp án",
  "dịch phần passage này",
], {
  contextType: "fullQuestion",
  expectedIntent: "question.translate_context",
  forbiddenIntents: ["safe_fallback"],
});

addMany("similar practice with context", [
  "cho câu tương tự để luyện",
  "tạo bài tương tự câu này",
  "cho tôi câu giống vậy",
  "luyện thêm dạng này",
  "tạo câu hỏi cùng dạng",
  "similar practice",
  "give me a similar question",
  "cho thêm 3 câu giống dạng này",
  "luyện lại dạng bẫy này",
], {
  contextType: "fullQuestion",
  expectedIntent: "question.similar_practice",
  forbiddenIntents: ["safe_fallback"],
});

addMany("missing question context", [
  "giải thích câu này",
  "tại sao không chọn A",
  "dịch câu này",
  "câu này dùng thì gì",
  "cho câu tương tự",
  "sao đáp án B đúng",
  "từ này nghĩa là gì",
  "phân tích lựa chọn A B C D",
], {
  contextType: "none",
  expectedIntent: "clarify",
  forbiddenIntents: ["test_attempt.analysis"],
});

addMany("attempt only no questionId", [
  "giải thích câu này",
  "đáp án này sao vậy",
  "tại sao không chọn A",
  "dịch câu này",
  "câu này dùng thì gì",
  "vậy câu vừa rồi thì sao",
], {
  contextType: "attemptOnly",
  expectedIntent: "clarify",
  forbiddenIntents: ["safe_fallback", "test_attempt.analysis"],
});

addMany("follow-up continuity", [
  "giải thích kỹ hơn",
  "nói đơn giản hơn",
  "cho ví dụ khác",
  "còn đáp án C thì sao",
  "vậy A sai vì đâu",
  "dịch tiếp",
  "cho thêm bài giống vậy",
], {
  contextType: "questionState",
  expectedIntentOneOf: [
    "question.explain_specific",
    "question.translate_context",
    "question.similar_practice",
    "clarify",
  ],
  forbiddenIntents: ["safe_fallback"],
});
addMany("follow-up progress/roadmap", [
  "còn Part 7 thì sao",
  "tiếp tục đi",
], {
  contextType: "roadmapState",
  expectedIntentOneOf: ["roadmap.summary", "roadmap.next_step", "toeic_knowledge.general", "clarify"],
  forbiddenIntents: ["safe_fallback"],
});

addMany("mixed Vietnamese-English", [
  "explain câu này giúp tôi",
  "translate câu này",
  "grammar chỗ này là gì",
  "vocab câu này có gì quan trọng",
  "give me similar practice",
], {
  contextType: "fullQuestion",
  expectedIntentOneOf: [
    "question.explain_specific",
    "question.translate_context",
    "grammar.contextual",
    "vocabulary.contextual",
    "question.similar_practice",
  ],
  forbiddenIntents: ["safe_fallback"],
});
addMany("mixed Vietnamese-English global", [
  "my weakest TOEIC skill là gì",
  "open roadmap",
  "create flashcard from wrong answers",
  "review latest attempt",
  "show my progress",
  "Part 5 strategy là gì",
], {
  contextType: "none",
  expectedIntentOneOf: [
    "user_progress.summary",
    "user_progress.ability_map",
    "roadmap.guidance",
    "flashcard.create",
    "test_attempt.analysis",
    "toeic_knowledge.general",
  ],
  forbiddenIntents: ["safe_fallback"],
});

addMany("typo / informal Vietnamese", [
  "giai thich cau nay",
  "tai sao ko chon A",
  "dich cau nay",
  "tu nay nghia la gi",
], {
  contextType: "fullQuestion",
  expectedIntentOneOf: [
    "question.explain_specific",
    "question.translate_context",
    "vocabulary.contextual",
  ],
  forbiddenIntents: ["safe_fallback"],
});
addMany("typo / informal Vietnamese global", [
  "toi yeu phan nao",
  "mo lo trinh hoc",
  "tao flashcard tu sai",
  "bai vua lam sai gi",
  "cam on nha",
  "okeee",
], {
  contextType: "attemptOnly",
  expectedIntentOneOf: [
    "user_progress.summary",
    "roadmap.guidance",
    "flashcard.create",
    "test_attempt.analysis",
    "smalltalk.greeting_feedback",
    "clarify",
  ],
  forbiddenIntents: ["safe_fallback"],
});

addMany("negative collision", [
  "phân tích bài vừa làm",
  "bài vừa rồi yếu part nào",
], {
  contextType: "attemptOnly",
  expectedIntent: "test_attempt.analysis",
  forbiddenIntents: ["user_progress.summary", "user_progress.ability_map"],
});
addMany("negative collision: global progress", [
  "tôi yếu kỹ năng nào",
  "part nào yếu nhất của tôi",
], {
  contextType: "none",
  expectedIntentOneOf: ["user_progress.summary", "user_progress.ability_map"],
  forbiddenIntents: ["test_attempt.analysis"],
});
addMany("negative collision: question/general", [
  "dịch câu này",
  "tạo flashcard từ câu sai",
  "từ này nghĩa là gì",
  "tại sao câu này sai",
], {
  contextType: "fullQuestion",
  expectedIntentOneOf: [
    "question.translate_context",
    "flashcard.create",
    "vocabulary.contextual",
    "question.explain_specific",
  ],
  forbiddenIntents: ["toeic_knowledge.general", "safe_fallback"],
});
addMany("negative collision: navigation/roadmap", [
  "mở roadmap",
  "roadmap của tôi còn bao nhiêu bước",
  "xem câu sai ở đâu",
], {
  contextType: "none",
  expectedIntentOneOf: ["roadmap.guidance", "roadmap.summary", "app.navigation_support"],
  forbiddenIntents: ["question.explain_specific", "test_attempt.analysis"],
});

addMany("disabled listening intent guard", [
  "bài dictation này sai ở đâu",
  "phân tích bài dictation hiện tại",
  "tôi nghe thiếu từ nào trong dictation",
  "bài shadowing này tôi phát âm sai từ nào",
  "so sánh phần nói của tôi với transcript",
], {
  contextType: "dictation",
  expectedIntentOneOf: ["clarify", "gemini_fallback", "safe_fallback", "toeic_knowledge.general", "test_attempt.analysis"],
  forbiddenIntents: ["listening_practice.analysis"],
  notes: "listening_practice.analysis is DISABLED and should not be selected",
});

function actualLabel(result: Awaited<ReturnType<typeof routeChatMessage>>): ExpectedLabel {
  if (result.decision.kind === "route") return result.decision.intentId;
  if (result.decision.kind === "general_ai") return result.decision.intentId;
  if (result.decision.kind === "gemini_fallback") return "gemini_fallback";
  if (result.decision.kind === "clarify_with_options") return "clarify_with_options";
  return result.decision.kind;
}

function expectedLabel(testCase: RoutingRegressionCase) {
  if (testCase.expectedIntent) return testCase.expectedIntent;
  if (testCase.expectedIntentOneOf) return testCase.expectedIntentOneOf.join(" | ");
  if (testCase.forbiddenIntents) return `not ${testCase.forbiddenIntents.join(" | ")}`;
  return "no assertion";
}

function classifyLikelyCause(result: RoutingCaseResult) {
  if (result.passed) return undefined;
  const reasonCodes = result.reasonCodes ?? [];
  if (reasonCodes.includes("missing_question_reference")) return "question reference/context resolver did not resolve the active question";
  if (reasonCodes.includes("hard_out_of_scope_before_chroma")) return "hard out-of-scope guard fired unexpectedly or expectation is wrong";
  if (result.actualIntent === "safe_fallback") return "router returned a hard safe fallback instead of semantic/context handling";
  if (result.actualIntent === "gemini_fallback") return "semantic match was missing, ambiguous, degraded, or below the score gate";
  if (result.routeSource === "semantic") return "semantic candidate won after missing or weak rule precedence";
  if (result.routeSource === "fast_path") return "fast-path rule matched a competing intent";
  return "routing precedence or expected intent needs review";
}

function suggestedFixFor(result: RoutingCaseResult) {
  if (result.passed) return undefined;
  const reasonCodes = result.reasonCodes ?? [];
  if (reasonCodes.includes("missing_question_reference")) {
    return "Check routeContext/questionRefs and contextual question resolver before Chroma.";
  }
  if (reasonCodes.includes("hard_out_of_scope_before_chroma")) {
    return "Narrow or expand the conservative hard out-of-scope guard based on this input.";
  }
  if (result.actualIntent === "safe_fallback") {
    return "Review why this still reached hard safe fallback instead of Chroma-first route or Gemini fallback.";
  }
  if (result.actualIntent === "gemini_fallback") {
    return "Review semantic examples, rerank thresholds, or add an intent/resolver if this should be first-class.";
  }
  if (result.routeSource === "semantic") {
    return "Promote this stable pattern into router precedence rules if it should not depend on Chroma.";
  }
  if (result.routeSource === "fast_path") {
    return "Review fast-path rule ordering and collision patterns for this input.";
  }
  return "Review backend-only router precedence, context validation, and catalog expectations.";
}

function failureReasonFor(
  testCase: RoutingRegressionCase,
  actual: ExpectedLabel,
  result: Awaited<ReturnType<typeof routeChatMessage>>
) {
  const failures: string[] = [];
  if (testCase.expectedIntent && actual !== testCase.expectedIntent) {
    failures.push(`expected ${testCase.expectedIntent} but got ${actual}`);
  }
  if (testCase.expectedIntentOneOf && !testCase.expectedIntentOneOf.includes(actual)) {
    failures.push(`expected one of ${testCase.expectedIntentOneOf.join(", ")} but got ${actual}`);
  }
  if (testCase.forbiddenIntents?.includes(actual)) {
    failures.push(`actual intent ${actual} is forbidden for this case`);
  }
  const expectedChromaQueried =
    typeof testCase.expectChromaQueried === "boolean"
      ? testCase.expectChromaQueried
      : true;
  if (result.diagnostics.chromaQueried !== expectedChromaQueried) {
    failures.push(`expected chromaQueried=${expectedChromaQueried} but got ${!!result.diagnostics.chromaQueried}`);
  }
  if (
    typeof testCase.expectChromaAvailable === "boolean" &&
    result.diagnostics.chromaAvailable !== testCase.expectChromaAvailable
  ) {
    failures.push(`expected chromaAvailable=${testCase.expectChromaAvailable} but got ${!!result.diagnostics.chromaAvailable}`);
  }
  if (testCase.expectReasonCode && !result.reasonCodes.includes(testCase.expectReasonCode)) {
    failures.push(`missing reasonCode ${testCase.expectReasonCode}`);
  }
  if (result.reasonCodes.includes("semantic_post_chroma_rule_override")) {
    failures.push("free-text route used forbidden semantic_post_chroma_rule_override");
  }
  const actualIsPseudo =
    actual === "clarify" ||
    actual === "clarify_with_options" ||
    actual === "gemini_fallback" ||
    actual === "safe_fallback";
  if (result.diagnostics.chromaAvailable === false && !actualIsPseudo) {
    failures.push(`chromaAvailable=false must not route real intent ${actual}`);
  }
  return failures.join("; ") || undefined;
}

function passCase(
  testCase: RoutingRegressionCase,
  actual: ExpectedLabel,
  result: Awaited<ReturnType<typeof routeChatMessage>>
) {
  const exactOk = !testCase.expectedIntent || actual === testCase.expectedIntent;
  const oneOfOk =
    !testCase.expectedIntentOneOf || testCase.expectedIntentOneOf.includes(actual);
  const forbiddenOk =
    !testCase.forbiddenIntents || !testCase.forbiddenIntents.includes(actual);
  const expectedChromaQueried =
    typeof testCase.expectChromaQueried === "boolean"
      ? testCase.expectChromaQueried
      : true;
  const chromaOk = result.diagnostics.chromaQueried === expectedChromaQueried;
  const chromaAvailableOk =
    typeof testCase.expectChromaAvailable !== "boolean" ||
    result.diagnostics.chromaAvailable === testCase.expectChromaAvailable;
  const reasonOk =
    !testCase.expectReasonCode ||
    result.reasonCodes.includes(testCase.expectReasonCode);
  const noPostRuleOverride = !result.reasonCodes.includes("semantic_post_chroma_rule_override");
  const actualIsPseudo =
    actual === "clarify" ||
    actual === "clarify_with_options" ||
    actual === "gemini_fallback" ||
    actual === "safe_fallback";
  const noRealIntentWhenChromaUnavailable =
    result.diagnostics.chromaAvailable !== false || actualIsPseudo;
  return exactOk && oneOfOk && forbiddenOk && chromaOk && chromaAvailableOk && reasonOk && noPostRuleOverride && noRealIntentWhenChromaUnavailable;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function contextPayload(context: (typeof CONTEXTS)[keyof typeof CONTEXTS]) {
  return {
    routeContext: context.routeContext,
    conversationState: "conversationState" in context ? context.conversationState : undefined,
  };
}

function expectedIntentValues(testCase: RoutingRegressionCase) {
  return [
    ...(testCase.expectedIntent ? [testCase.expectedIntent] : []),
    ...(testCase.expectedIntentOneOf ?? []),
  ];
}

function caseReferencesIntent(testCase: RoutingRegressionCase, result: RoutingCaseResult, intentId: string) {
  return (
    expectedIntentValues(testCase).includes(intentId as ExpectedLabel) ||
    (testCase.forbiddenIntents ?? []).includes(intentId as ExpectedLabel) ||
    result.actualIntent === intentId
  );
}

function formatPassRate(passed: number, total: number) {
  return total > 0 ? `${((passed / total) * 100).toFixed(1)}%` : "0.0%";
}

function markdownEscape(value: unknown) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function markdownTable(headers: string[], rows: Array<Array<unknown>>) {
  const headerLine = `| ${headers.map(markdownEscape).join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((row) => `| ${row.map(markdownEscape).join(" | ")} |`);
  return [headerLine, dividerLine, ...rowLines].join("\n");
}

function buildMarkdownReport(params: {
  summary: Record<string, unknown>;
  groupRows: Array<Record<string, unknown>>;
  intentRows: Array<Record<string, unknown>>;
  failed: RoutingCaseResult[];
  passed: RoutingCaseResult[];
}) {
  const { summary, groupRows, intentRows, failed, passed } = params;
  const summaryRows = [
    ["Generated At", summary.generatedAt],
    ["Total Cases", summary.totalCases],
    ["Passed Cases", summary.passedCases],
    ["Failed Cases", summary.failedCases],
    ["Pass Rate", summary.passRate],
    ["Total Active Intents", summary.activeIntentCount],
    ["Covered Active Intents", Array.isArray(summary.coveredActiveIntents) ? summary.coveredActiveIntents.length : 0],
    ["Uncovered Active Intents", Array.isArray(summary.uncoveredActiveIntents) ? summary.uncoveredActiveIntents.length : 0],
  ];
  const groupTable = markdownTable(
    ["Group", "Total", "Pass", "Fail", "Pass Rate"],
    groupRows.map((row) => [row.group, row.total, row.pass, row.fail, row.passRate])
  );
  const intentTable = markdownTable(
    ["Intent ID", "Total Cases", "Pass", "Fail", "Status", "Notes"],
    intentRows.map((row) => [row.intentId, row.totalCases, row.pass, row.fail, row.status, row.notes])
  );
  const failureTable =
    failed.length > 0
      ? markdownTable(
          ["ID", "Group", "Input", "Expected", "Actual", "Source", "Chroma", "Reason Codes", "Likely Cause"],
          failed.map((row) => [
            row.id,
            row.group,
            row.input,
            row.expectedIntent ?? row.expectedIntentOneOf?.join(" | ") ?? "no assertion",
            row.actualIntent,
            row.routeSource,
            row.chromaQueried,
            row.reasonCodes?.join(","),
            row.likelyCause,
          ])
        )
      : "No failed cases.";
  const passedSemanticCount = passed.filter((row) => row.chromaQueried).length;

  return [
    "# Chatbot Routing Full Regression Report",
    "",
    "Generated by `TOEIC_server/scripts/check-chatbot-routing-full-regression.ts`.",
    "",
    "## Summary",
    "",
    markdownTable(["Metric", "Value"], summaryRows),
    "",
    "## Group Results",
    "",
    groupTable,
    "",
    "## Intent Coverage",
    "",
    intentTable,
    "",
    "## Failed Cases",
    "",
    failureTable,
    "",
    "## Passed Case Traceability",
    "",
    `Passed cases are stored in \`${path.basename(REPORT_FILES.passed)}\`. ${passedSemanticCount} passed case(s) queried Chroma. For free-text, this is required; deterministic UI quick actions are the only expected bypass.`,
    "",
    "## Report Files",
    "",
    markdownTable(
      ["File", "Purpose"],
      [
        [path.basename(REPORT_FILES.summary), "Overall totals, group table, intent coverage, and report metadata."],
        [path.basename(REPORT_FILES.passed), "Full per-case trace for every passed routing case."],
        [path.basename(REPORT_FILES.failed), "Full per-case trace for every failed routing case."],
        [path.basename(REPORT_FILES.markdown), "Human-readable summary report."],
      ]
    ),
    "",
  ].join("\n");
}

function writeReports(params: {
  summary: Record<string, unknown>;
  passed: RoutingCaseResult[];
  failed: RoutingCaseResult[];
  groupRows: Array<Record<string, unknown>>;
  intentRows: Array<Record<string, unknown>>;
}) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILES.summary, `${JSON.stringify(params.summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(REPORT_FILES.passed, `${JSON.stringify(params.passed, null, 2)}\n`, "utf8");
  fs.writeFileSync(REPORT_FILES.failed, `${JSON.stringify(params.failed, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    REPORT_FILES.markdown,
    buildMarkdownReport({
      summary: params.summary,
      groupRows: params.groupRows,
      intentRows: params.intentRows,
      failed: params.failed,
      passed: params.passed,
    }),
    "utf8"
  );
}

async function run() {
  const results: RoutingCaseResult[] = [];

  for (const testCase of cases) {
    const context = CONTEXTS[testCase.contextType];
    const previousForceChromaError = process.env.CHAT_INTENT_FORCE_CHROMA_ERROR;
    if (testCase.forceChromaError) {
      process.env.CHAT_INTENT_FORCE_CHROMA_ERROR = "1";
    } else {
      delete process.env.CHAT_INTENT_FORCE_CHROMA_ERROR;
    }
    let routeResult: Awaited<ReturnType<typeof routeChatMessage>>;
    try {
      routeResult = await routeChatMessage({
        userText: testCase.input,
        routeContext: context.routeContext,
        conversationState: "conversationState" in context ? context.conversationState : undefined,
      });
    } finally {
      if (typeof previousForceChromaError === "string") {
        process.env.CHAT_INTENT_FORCE_CHROMA_ERROR = previousForceChromaError;
      } else {
        delete process.env.CHAT_INTENT_FORCE_CHROMA_ERROR;
      }
    }
    const actual = actualLabel(routeResult);
    const pass = passCase(testCase, actual, routeResult);
    const row: RoutingCaseResult = {
      id: testCase.id,
      group: testCase.group,
      input: testCase.input,
      contextType: testCase.contextType,
      context: contextPayload(context),
      expectedIntent: testCase.expectedIntent,
      expectedIntentOneOf: testCase.expectedIntentOneOf,
      forbiddenIntents: testCase.forbiddenIntents,
      actualIntent: actual,
      actualConfidence: Number((routeResult.confidence ?? 0).toFixed(4)),
      routeSource: routeResult.source,
      chromaQueried: !!routeResult.diagnostics.chromaQueried,
      chromaAvailable: !!routeResult.diagnostics.chromaAvailable,
      reasonCodes: routeResult.reasonCodes,
      diagnostics: routeResult.diagnostics,
      passed: pass,
      failureReason: pass ? undefined : failureReasonFor(testCase, actual, routeResult),
      notes: testCase.notes,
      decision: routeResult.decision.kind,
    };
    row.likelyCause = classifyLikelyCause(row);
    row.suggestedFix = suggestedFixFor(row);
    results.push(row);
  }

  const failed = results.filter((row) => !row.passed);
  const passed = results.filter((row) => row.passed);
  const activeIntentEntries = CHAT_INTENT_EXAMPLES.filter((entry) => entry.availability !== "DISABLED");
  const disabledIntentEntries = CHAT_INTENT_EXAMPLES.filter((entry) => entry.availability === "DISABLED");
  const pairedResults = results.map((result, index) => ({
    result,
    testCase: cases[index],
  }));

  const groupRows = Array.from(groupBy(results, (row) => row.group)).map(([group, rows]) => ({
    group,
    total: rows.length,
    pass: rows.filter((row) => row.passed).length,
    fail: rows.filter((row) => !row.passed).length,
    passRate: formatPassRate(rows.filter((row) => row.passed).length, rows.length),
  }));

  const pseudoIntents = [
    { intentId: "clarify", availability: "PSEUDO", contextType: "resolver outcome", contextPolicy: { onMissing: "CLARIFY" } },
    { intentId: "clarify_with_options", availability: "PSEUDO", contextType: "resolver outcome", contextPolicy: { onMissing: "CLARIFY" } },
    { intentId: "gemini_fallback", availability: "PSEUDO", contextType: "resolver outcome", contextPolicy: { onMissing: "GEMINI_FALLBACK" } },
    { intentId: "safe_fallback", availability: "PSEUDO", contextType: "resolver outcome", contextPolicy: { onMissing: "SAFE_FALLBACK" } },
  ];
  const intentRows = [...CHAT_INTENT_EXAMPLES, ...pseudoIntents].map((entry) => {
    const relatedRows = pairedResults
      .filter(({ result, testCase }) => caseReferencesIntent(testCase, result, entry.intentId))
      .map(({ result }) => result);
    const intentPassed = relatedRows.filter((row) => row.passed).length;
    return {
      intentId: entry.intentId,
      totalCases: relatedRows.length,
      pass: intentPassed,
      fail: relatedRows.filter((row) => !row.passed).length,
      passRate: formatPassRate(intentPassed, relatedRows.length),
      status: entry.availability === "DISABLED" ? "disabled" : entry.availability === "PSEUDO" ? "pseudo" : "active",
      notes:
        entry.availability === "PSEUDO"
          ? `${entry.contextType}; onMissing=${entry.contextPolicy.onMissing}`
          : `${entry.availability}; ${entry.contextType}; onMissing=${entry.contextPolicy.onMissing}`,
    };
  });

  const coveredIntents = new Set<string>();
  for (const row of results) {
    if (
      row.actualIntent !== "clarify" &&
      row.actualIntent !== "clarify_with_options" &&
      row.actualIntent !== "gemini_fallback" &&
      row.actualIntent !== "safe_fallback"
    ) coveredIntents.add(row.actualIntent);
  }
  for (const testCase of cases) {
    if (
      testCase.expectedIntent &&
      testCase.expectedIntent !== "clarify" &&
      testCase.expectedIntent !== "clarify_with_options" &&
      testCase.expectedIntent !== "gemini_fallback" &&
      testCase.expectedIntent !== "safe_fallback"
    ) {
      coveredIntents.add(testCase.expectedIntent);
    }
    for (const intent of testCase.expectedIntentOneOf ?? []) {
      if (
        intent !== "clarify" &&
        intent !== "clarify_with_options" &&
        intent !== "gemini_fallback" &&
        intent !== "safe_fallback"
      ) coveredIntents.add(intent);
    }
  }
  const coveredActiveIntents = activeIntentEntries
    .filter((entry) => coveredIntents.has(entry.intentId))
    .map((entry) => entry.intentId)
    .sort();
  const uncoveredActiveIntents = activeIntentEntries
    .filter((entry) => !coveredIntents.has(entry.intentId))
    .map((entry) => entry.intentId)
    .sort();
  const summary = {
    generatedAt: new Date().toISOString(),
    reportDir: REPORT_DIR,
    reportFiles: REPORT_FILES,
    totalCases: results.length,
    passedCases: passed.length,
    failedCases: failed.length,
    passRate: `${((passed.length / results.length) * 100).toFixed(2)}%`,
    totalCatalogIntents: CHAT_INTENT_EXAMPLES.length,
    activeIntentCount: activeIntentEntries.length,
    disabledIntentCount: disabledIntentEntries.length,
    disabledIntents: disabledIntentEntries.map((entry) => entry.intentId),
    coveredActiveIntents,
    uncoveredActiveIntents,
    groupResults: groupRows,
    intentCoverage: intentRows,
  };

  writeReports({ summary, passed, failed, groupRows, intentRows });

  const caseTableRow = (row: RoutingCaseResult) => ({
    id: row.id,
    group: row.group,
    input: row.input,
    contextType: row.contextType,
    expected: row.expectedIntent ?? row.expectedIntentOneOf?.join(" | ") ?? "no assertion",
    forbidden: row.forbiddenIntents?.join(" | ") ?? "",
    actual: row.actualIntent,
    confidence: row.actualConfidence,
    source: row.routeSource,
    chromaQueried: row.chromaQueried,
    chromaAvailable: row.chromaAvailable,
    reasonCodes: row.reasonCodes?.join(","),
    passed: row.passed,
  });

  console.log("\n# Summary");
  console.log(JSON.stringify({
    totalCases: summary.totalCases,
    passedCases: summary.passedCases,
    failedCases: summary.failedCases,
    passRate: summary.passRate,
    totalActiveIntents: summary.activeIntentCount,
    coveredActiveIntents: summary.coveredActiveIntents.length,
    uncoveredActiveIntents: summary.uncoveredActiveIntents.length,
  }, null, 2));
  if (process.env.ROUTING_REGRESSION_VERBOSE === "1") {
    console.log("\n# Passed Cases");
    console.table(passed.map(caseTableRow));
    console.log("\n# Failed Cases");
    console.table(failed.map(caseTableRow));
  }
  console.log("\n# Group Results");
  console.table(groupRows);
  console.log("\n# Intent Coverage Results");
  console.table(intentRows);
  console.log("\n# Top Failures");
  console.table(failed.slice(0, 25).map((row) => ({
    id: row.id,
    group: row.group,
    input: row.input,
    contextType: row.contextType,
    expected: row.expectedIntent ?? row.expectedIntentOneOf?.join(" | ") ?? "no assertion",
    forbidden: row.forbiddenIntents?.join(" | ") ?? "",
    actual: row.actualIntent,
    source: row.routeSource,
    chroma: row.chromaQueried,
    chromaAvailable: row.chromaAvailable,
    reasonCodes: row.reasonCodes?.join(","),
    failureReason: row.failureReason,
    likelyCause: row.likelyCause,
    suggestedFix: row.suggestedFix,
  })));
  console.log("\n# Report Files");
  console.table(Object.entries(REPORT_FILES).map(([name, filePath]) => ({ name, filePath })));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
