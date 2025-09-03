import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import logger from '../configs/logger';

// Middleware log HTTP request
export const httpLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user?._id || 'anonymous';
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      `[${req.method}] ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
      { userId },
    );
  });

  next();
};

// Middleware log errors
export const errorLogger: ErrorRequestHandler = (
  err: any,
  req: Request, // để match type của ErrorRequestHandler
  res: Response,
  next: NextFunction,
) => {
  // ép kiểu để dùng user
  const userId = req.user?._id || 'anonymous';

  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`, {
    userId,
    stack: err.stack,
  });
  next(err);
};
