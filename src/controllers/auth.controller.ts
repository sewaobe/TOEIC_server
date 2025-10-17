import { Request, Response, NextFunction } from 'express';
import { loginService, loginWithGoogleService, registerService } from '../services/auth.service';
import jwt from 'jsonwebtoken';
import { generateAccessTokenFromPayload, UserPayload } from '../utils/jwt';
import { ApiResponse } from '../utils/ApiResponse';

// Login
export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const loginRequest = req.body;
    const isRemember = loginRequest.isRemember;
    
    const { accessToken, refreshToken, role_name } = await loginService(
      loginRequest,
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false, // đổi true nếu deploy HTTPS
      sameSite: 'lax',
      ...(isRemember ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}), // 7 ngày nếu nhớ đăng nhập
    });

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      ...(isRemember ? { maxAge: 15 * 60 * 1000 } : {}), // 15 phút nếu nhớ đăng nhập
    });

    res.status(200).json(ApiResponse.success(null, 'Login successfully', {
      role_name: role_name
    }));
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
    res.status(201).json(ApiResponse.success(null, result.message));
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
      res.status(401).json(ApiResponse.fail('Refresh token missing'));
      return;
    }

    jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as string,
      (err, decoded) => {
        if (err || !decoded) {
          res.status(403).json(ApiResponse.fail('Invalid or expired refresh token'));
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

        res.status(200).json(ApiResponse.success(null, 'Refresh token successfully'));

      },
    );
  } catch (err) {
    next(err);
  }
};

export const logoutController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Xóa cookie accessToken và refreshToken
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: false,   // set true nếu bạn dùng HTTPS
      sameSite: 'lax',
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: false,   // set true nếu bạn dùng HTTPS
      sameSite: 'lax',
    });

    // Optionally: trả về message
    res.status(200).json(ApiResponse.success(null, 'Logged out successfully'));

  } catch (err) {
    next(err);
  }
};

export const loginWithGoogleController = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Missing idToken' });
    }

    const { accessToken, refreshToken, role_name } = await loginWithGoogleService(idToken);
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

    res.status(200).json(ApiResponse.success(null, 'Login successfully', {
      role_name: role_name
    }));

  } catch (error: any) {
    res.status(401).json({ message: error.message });
  }
};