import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';


// Tùy chỉnh JwtPayload
export interface JwtUserPayload extends JwtPayload {
  _id: string;
  role: string;
  email: string;
  username: string;
  fullname: string;
};
export const verifyAccessToken: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // 1. Lấy ID người dùng đang hoạt động từ header
  const activeUserId = req.header("X-Active-User-ID");
  if (!activeUserId) {
    const error = new Error('Active User ID header (X-Active-User-ID) is missing') as any;
    error.status = 401;
    throw error;
  }

  // 2. Dựng tên cookie động và lấy token
  const tokenCookieName = `accessToken_${activeUserId}`;
  const token = req.cookies?.[tokenCookieName];
  if (!token) {
    const error = new Error('Access token is missing') as any;
    error.status = 401;
    return next(error);
  }

  try {
    // 3. Giải mã token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as JwtUserPayload;

    // 4. KIỂM TRA CHÉO
    if (decoded._id !== activeUserId) {
      const error = new Error('Forbidden: Token ownership mismatch.') as any;
      error.status = 403; // 403 Forbidden vì đây là hành vi truy cập trái phép
      throw error;
    }

    // 5. Hợp lệ
    req.user = decoded; // gán payload đã decode vào req.user
    next();
  } catch (err) {
    next(err);
  }
};
