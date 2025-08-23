import { Request, Response, NextFunction } from 'express';
import { loginService, registerService } from '../services/auth.service';
import jwt from 'jsonwebtoken';
import { generateAccessTokenFromPayload, UserPayload } from '../utils/jwt';

// Login
export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const loginRequest = req.body;
    const { accessToken, refreshToken } = await loginService(loginRequest);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false, // đổi true nếu deploy HTTPS
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    });

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 2 * 60 * 1000, // 2 phút (ở code của bạn ghi comment 15 phút nhưng config 2 phút, bạn check lại)
    });

    res.status(200).json({ message: 'Login successfully' });
  } catch (err) {
    next(err);
  }
};

// Register
export const registerController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const registerRequest = req.body;
    const result = await registerService(registerRequest);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// Refresh Token
export const refreshTokenController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) {
      res.status(401).json({ message: 'Refresh token missing' });
      return;
    }

    jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as string,
      (err, decoded) => {
        if (err || !decoded) {
          res.status(403).json({ message: 'Invalid or expired refresh token' });
          return;
        }

        const accessToken = generateAccessTokenFromPayload(
          decoded as UserPayload,
        );

        res.cookie('accessToken', accessToken, {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 15 * 60 * 1000, // 15 phút
        });

        res.status(200).json({ message: 'Refresh token successfully' });
      },
    );
  } catch (err) {
    next(err);
  }
};
