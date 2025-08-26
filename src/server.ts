import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { connectDB } from './configs/db';
import authRouter from './routes/auth.route';

import userRouter from './routes/user.route';
import { errorLogger, httpLogger } from './middlewares/logger.middleware';

connectDB();

const app = express();

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json());
app.use(helmet());
app.use(cookieParser());

// Router API
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use(errorLogger);

// Middleware xử lý lỗi cuối cùng
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
