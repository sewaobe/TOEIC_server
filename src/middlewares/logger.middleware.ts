// middlewares/loggerMiddleware.ts
import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
  ErrorRequestHandler,
} from 'express';
import logger from '../configs/logger';

// Nếu bạn muốn gán thêm user vào req
export interface AuthenticatedRequest extends Request {
  user?: {
    _id?: string;
    [key: string]: any;
  };
}

// Middleware log HTTP request
export const httpLogger: RequestHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user?._id || 'anonymous';
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      `[${req.method}] ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
      {
        userId,
      },
    );
  });

  next();
};

// Middleware log errors
export const errorLogger: ErrorRequestHandler = (
  err: any,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user?._id || 'anonymous';
  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`, {
    userId,
    stack: err.stack,
  });
  next(err);
};
