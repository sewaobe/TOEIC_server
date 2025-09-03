import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

// Tùy chỉnh JwtPayload
export interface JwtUserPayload extends JwtPayload {
  _id: string;
  role: string;
  email: string;
  username: string;
  fullname: string;
}
export const verifyAccessToken: RequestHandler = (
  req: Request,
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
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as JwtUserPayload;
    req.user = decoded; // gán payload đã decode vào req.user
    next();
  } catch (err) {
    next(err);
  }
};
