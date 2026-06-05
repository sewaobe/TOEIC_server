/// <reference path="./types/express/index.d.ts" />
import dotenv from "dotenv";
dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

import * as Sentry from '@sentry/node'; // Sentry
import { nodeProfilingIntegration } from '@sentry/profiling-node'; // Sentry

// === KHỞI TẠO SENTRY ===
if (isProduction) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      // Bật tính năng theo dõi hiệu suất (Profiling)
      nodeProfilingIntegration(),
    ],
    // TracesSampleRate: 1.0 nghĩa là gửi 100% dữ liệu về Sentry (Dùng lúc dev/test)
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  })
}

import express, { Request, Response } from "express";
import path from "path";
import cors from "cors";
import http from "http";

import helmet from "helmet";
import cookieParser from "cookie-parser";
import { connectDB } from "./configs/db";
import authRouter from "./routes/auth.route";
import userRouter from "./routes/user.route";
import testRouter from "./routes/test.route";
import userTestRouter from "./routes/user_test.route";
import commentRouter from "./routes/comment.route";
import learningPathRouter from "./routes/user_learningPath.route";
import learningPathV2Router from "./routes/learning_path_v2.route";
import dayStudyRouter from "./routes/day_study.route";
import feedbackRouter from "./routes/feedback.route";
import flashCardRouter from "./routes/flashCard.route";
import demoRouter from "./routes/demo.route";
import notificationRouter from "./routes/notification.route";
import subscriptionRouter from "./routes/subscription.route";
import flashcardProgressRouter from "./routes/flashcard_progress.route";
import questionRouter from "./routes/question.route";
import reportRouter from "./routes/report.route";
import ctvTestRouter from "./routes/ctv/ctv_test.route";
import ctvTopicRouter from "./routes/ctv/ctv_topic.route";
import ctvVocabularyRouter from "./routes/ctv/ctv_vocabulary.route";
import ctvGroupRouter from "./routes/ctv/ctv_group.route";
import ctvFolderRoutes from "./routes/ctv/ctv_media_folder.route";
import ctvDictationRouter from "./routes/ctv/ctv_dictation.route";
import ctvShadowingRouter from "./routes/ctv/ctv_shadowing.route";
import ctvStudentRouter from "./routes/ctv/ctv_student.route";
import ctvLessonManagerRouter from "./routes/ctv/ctv_lesson_manager.route";
import ctvLessonRouter from "./routes/ctv/ctv_lesson.route";
import ctvQuizRouteRouter from "./routes/ctv/ctv_quiz.route";
import ctvDashboardRouter from "./routes/ctv/ctv_dashboard.route"; // Import dashboard route
import adminUsersRouter from "./routes/admin/admin.users.route";
import adminTestsRouter from "./routes/admin/admin.tests.route";
import adminLessonsRouter from "./routes/admin/admin.lessons.route";
import adminRequestCollaboratorRouter from "./routes/admin/admin_request_collaborator.route";
import adminReportsRouter from "./routes/admin/admin.report.route";
import ctvReportRouter from "./routes/ctv/ctv_report.route";
import geminiRouter from "./routes/gemini.route";
import ragRouter from "./routes/rag.route";
import chatRouter from "./routes/chat.route";
import chatFeedbackRouter from "./routes/chat_feedback.route";
import azureAIRouter from "./routes/azureAI.route";
import dictationUserRouter from "./routes/dictation.route";
import dictationAttemptRouter from "./routes/dictation_attempt.route";
import shadowingUserRouter from "./routes/shadowing.route";
import progressUserRouter from "./routes/progress.route";
import shadowingV2Router from "./routes/shadowing_v2.route";
import shadowingAttemptRouter from "./routes/shadowing_attempt.route";
import userVocabularyProgressV2Router from "./routes/user_vocabulary_progress_v2.route";

// 🆕 Learning Path routes (user study in learning path)
import quizLearningPathRouter from "./routes/quiz_learningpath.route";
import dictationLearningPathRouter from "./routes/dictation_learningpath.route";
import lessonLearningPathRouter from "./routes/lesson_learningpath.route";
import flashcardLearningPathRouter from "./routes/flashcard_learningpath.route";
import shadowingLearningPathRouter from "./routes/shadowing_learningpath.route";
import userStudyRouter from "./routes/user_study.route";
import historyRouter from "./routes/history.route";

import vocabulary_definition_attempt_router from "./routes/vocabulary_definition_attempt.route";
import practice_session_router from "./routes/practice_session.route";
import userNoteRouter from "./routes/user_note.route";
import vocabularyWordRouter from "./routes/vocabulary_word.route";
import ctvPracticeTopicVocabularyRouter from "./routes/ctv/ctv_practice_topic_vocabulary.route";
import practice_definition_router from "./routes/practice_definition.route";
import irtRouter from "./routes/irt.route";
import adjustmentRequestRouter from "./routes/adjustment_request.route";
import { errorLogger } from "./middlewares/logger.middleware";
import { ApiResponse } from "./utils/ApiResponse";
import { verifyAccessToken } from "./middlewares/verifyAccessToken.middleware";
import { initSocket } from "./socket";
import { setupSwagger } from "./swagger";
import "./listeners";
import startRemoveInactiveUsersJob from "./jobs/removeInactiveUsers.job";

connectDB();

// Start scheduled jobs (daily cleanup)
try {
  startRemoveInactiveUsersJob();
} catch (err) {
  console.error("Failed to start scheduled jobs:", err);
}

const app = express();

const allowOrigins = process.env.ALLOW_ORIGINS
  ? process.env.ALLOW_ORIGINS.split(",")
  : [];

app.use(
  cors({
    origin: allowOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'sentry-trace', 'baggage', 'sentry-sample-rate', 'Idempotency-Key'], // Thêm các header của Sentry
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(helmet());
app.use(cookieParser());

// Serve static files (audio generated by Azure TTS)
app.use("/static", express.static(path.resolve(__dirname, "../../static")));
app.disable("x-powered-by");

setupSwagger(app);
// Router API
app.use("/api/healthy", (req, res) => {
  res.status(200).json({ message: "Server is healthy test" });
});

app.use("/api/debug-sentry", (req, res) => {
  throw new Error("This is a test error for Sentry!");
});

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/tests", testRouter);
app.use("/api/user-test", userTestRouter);
app.use("/api/comments", commentRouter);
app.use("/api/learning-path", learningPathRouter);
app.use("/api/learning-path-v2", learningPathV2Router);
app.use("/api/day-study", dayStudyRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/flash-card", verifyAccessToken, flashCardRouter);
app.use("/api/demo", demoRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/subscriptions", subscriptionRouter);
app.use("/api/flashcard-progress", verifyAccessToken, flashcardProgressRouter);
app.use("/api/questions", verifyAccessToken, questionRouter);
app.use("/api/reports", verifyAccessToken, reportRouter);
app.use("/api/dictations", verifyAccessToken, dictationUserRouter);
app.use("/api/dictation-attempts", verifyAccessToken, dictationAttemptRouter);
app.use("/api/shadowings", verifyAccessToken, shadowingUserRouter);
app.use("/api/shadowing-attempts", verifyAccessToken, shadowingAttemptRouter);
app.use("/api/v2/shadowings", verifyAccessToken, shadowingV2Router);
app.use(
  "/api/v2/user-vocabulary-progress",
  verifyAccessToken,
  userVocabularyProgressV2Router,
);
app.use(
  "/api/progress/statistic-result",
  verifyAccessToken,
  progressUserRouter,
);
app.use(
  "/api/vocabulary-definition-attempts",
  verifyAccessToken,
  vocabulary_definition_attempt_router,
);
app.use("/api/practice-sessions", verifyAccessToken, practice_session_router);
app.use("/api/user-notes", verifyAccessToken, userNoteRouter);
app.use(
  "/api/practice-definition",
  verifyAccessToken,
  practice_definition_router,
);

// 🆕 Learning Path routes (activities in learning path flow)
app.use("/api/quiz-learningpath", quizLearningPathRouter);
app.use("/api/dictation-learningpath", dictationLearningPathRouter);
app.use("/api/lessons-learningpath", lessonLearningPathRouter);
app.use("/api/flashcards-learningpath", flashcardLearningPathRouter);
app.use("/api/shadowing-learningpath", shadowingLearningPathRouter);
app.use("/api/adjustment-requests", adjustmentRequestRouter);
app.use("/api/irt", verifyAccessToken, irtRouter);

// User study general routes
app.use("/api/history", historyRouter);
app.use("/api/user", userStudyRouter); // GET /streak, /study-history, /stats
// ========= CTV ============
app.use("/api/ctv", ctvTestRouter);
app.use("/api/ctv/topics", verifyAccessToken, ctvTopicRouter);
app.use("/api/ctv/vocabularies", verifyAccessToken, ctvVocabularyRouter);
app.use("/api/ctv/groups", verifyAccessToken, ctvGroupRouter);
app.use("/api/ctv/folders", verifyAccessToken, ctvFolderRoutes);

app.use("/api/ctv/dictation", verifyAccessToken, ctvDictationRouter);
app.use("/api/ctv/shadowing", verifyAccessToken, ctvShadowingRouter);
app.use("/api/ctv/students", verifyAccessToken, ctvStudentRouter);
app.use("/api/ctv/lesson-manager", verifyAccessToken, ctvLessonManagerRouter);
app.use("/api/ctv/lesson", verifyAccessToken, ctvLessonRouter);
app.use("/api/ctv/quiz", verifyAccessToken, ctvQuizRouteRouter);
app.use("/api/ctv/dashboard", verifyAccessToken, ctvDashboardRouter); // Use dashboard route
app.use("/api/ctv/reports", verifyAccessToken, ctvReportRouter);
app.use("/api/ctv/vocabulary-words", verifyAccessToken, vocabularyWordRouter);
app.use(
  "/api/ctv/practice-topics",
  verifyAccessToken,
  ctvPracticeTopicVocabularyRouter,
);
// Admin user management routes (list/detail/ban/unban)
app.use("/api/admin/users", verifyAccessToken, adminUsersRouter);
// Admin test approval routes
app.use("/api/admin/tests", verifyAccessToken, adminTestsRouter);
// Admin lesson approval routes
app.use("/api/admin/lessons", verifyAccessToken, adminLessonsRouter);
// ======== Admin Request Collaborator ========
app.use("/api/admin/request-collaborators", adminRequestCollaboratorRouter);
app.use("/api/admin/reports", verifyAccessToken, adminReportsRouter);

// AI
app.use("/api/gemini", verifyAccessToken, geminiRouter);
app.use("/api/rag", verifyAccessToken, ragRouter);
app.use("/api/chat", verifyAccessToken, chatRouter);
app.use("/api/chat-feedback", verifyAccessToken, chatFeedbackRouter);
// Mount Azure AI routes without auth for local/dev testing. Re-enable verifyAccessToken in production.
app.use("/api/azure-ai", azureAIRouter);

// Middleware của Sentry để ghi lại lỗi (phải đặt sau tất cả route)
if (isProduction) {
  Sentry.setupExpressErrorHandler(app);
}

app.use(errorLogger);

// Middleware xử lý lỗi cuối cùng (error-handling middleware MUST have 4 args)
app.use((err: any, req: Request, res: Response, next: any) => {
  const statusCode = err.status || 500;

  const sentryId = (res as any).sentry || 'Sentry inactive';

  const response = ApiResponse.fail(
    err.message || "Internal Server Error",
    process.env.NODE_ENV === "development" ? err.stack : undefined,
  );

  res.status(statusCode).json({
    ...response,
    errorId: sentryId, // Trả về ID lỗi của Sentry để dễ dàng tra cứu
  });
});

// === TẠO SERVER HTTP ===
const server = http.createServer(app);

// === KHỞI TẠO SOCKET.IO ===
initSocket(server);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
