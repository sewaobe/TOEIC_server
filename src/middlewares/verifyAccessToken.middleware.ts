import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

// Nếu bạn muốn gán thêm trường 'user' vào Request
export interface AuthenticatedRequest extends Request {
  user?:  JwtPayload;
}

export const verifyAccessToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  const token = req.cookies?.accessToken;
  if (!token) {
    const error = new Error('Access token is missing') as any;
    error.status = 401;
    return next(error);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as JwtPayload;
    req.user = decoded; // gán payload đã decode vào req.user
    next();
  } catch (err) {
    next(err);
  }
};
