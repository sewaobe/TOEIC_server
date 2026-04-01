import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import * as Sentry from '@sentry/node';


// Tùy chỉnh JwtPayload
export interface JwtUserPayload extends JwtPayload {
  _id: string;
  roleName: string;
  email: string;
  username: string;
  fullname: string;
};

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

    // Cấu hình Sentry user context
    if (process.env.NODE_ENV === "production") {
      Sentry.setUser({
        id: req.user._id,
        email: req.user.email,
        username: req.user.username,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};


export const verifyAccessTokenForSubmitTest: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const token = req.cookies?.accessToken;
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as JwtUserPayload;
    req.user = decoded; // gán payload đã decode vào req.user

    // Cấu hình Sentry user context
    if (process.env.NODE_ENV === "production") {
      Sentry.setUser({
        id: req.user._id,
        email: req.user.email,
        username: req.user.username,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};