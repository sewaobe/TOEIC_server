import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import helmet from "helmet";
import cookieParser from "cookie-parser";
import { connectDB } from "./configs/db";
import authRouter from "./routes/auth.route";
import userRouter from "./routes/user.route";
import testRouter from "./routes/test.route";
import userTestRouter from "./routes/user_test.route";
import commentRouter from "./routes/comment.route";
import learningPathRouter from "./routes/user_learningPath.route";
import dayStudyRoutes from "./routes/day_study.route";
import { errorLogger } from "./middlewares/logger.middleware";
import { ApiResponse } from "./utils/apiResponse";

connectDB();

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(helmet());
app.use(cookieParser());

// Router API
app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/tests", testRouter);
app.use("/api/user-test", userTestRouter)
app.use("/api/comments", commentRouter);
app.use("/api/learning-path", learningPathRouter);
app.use("/api/day-study", dayStudyRoutes);
app.use(errorLogger);

// Middleware xử lý lỗi cuối cùng
app.use((err: any, req: Request, res: Response) => {
  const statusCode = err.status || 500;

  const response = ApiResponse.fail(
    err.message || "Internal Server Error",
    process.env.NODE_ENV === "development" ? err.stack : undefined
  );

  res.status(statusCode).json(response);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
