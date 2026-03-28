import { Request, Response, NextFunction } from "express";
import {
  deleteRefreshToken,
  getUserSession,
  loginService,
  loginWithGoogleService,
  registerService,
  saveUserSession,
} from "../services/auth.service";
import jwt from "jsonwebtoken";
import { generateAccessTokenFromPayload, UserPayload } from "../utils/jwt";
import { ApiResponse } from "../utils/ApiResponse";

const accessTokenExpiredTime = 15 * 60 * 1000; // 15 phút
const refreshTokenExpiredTime = 7 * 24 * 60 * 60 * 1000; // 7 ngày

// Login
export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const loginRequest = req.body;
    const isRemember = loginRequest.isRemember;

    const { accessToken, refreshToken, role_name, user_id } = await loginService(
      loginRequest
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // đổi true nếu deploy HTTPS
      sameSite: "lax",
      ...(isRemember ? { maxAge: refreshTokenExpiredTime } : {}), // 7 ngày nếu nhớ đăng nhập
    });

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // đổi true nếu deploy HTTPS
      sameSite: "lax",
      maxAge: accessTokenExpiredTime, // 15 phút
    });

    // Save user session to DB
    await saveUserSession({
      userId: user_id,
      refreshToken,
      device_info: req.headers["user-agent"] || "Unknown device",
      ip_address: req.ip || "Unknown IP",
      expires_at: new Date(Date.now() + refreshTokenExpiredTime),
    })

    res.status(200).json(
      ApiResponse.success(null, "Login successfully", {
        role_name: role_name,
      })
    );
  } catch (err: any) {
    // Xử lý lỗi account bị ban
    if (err.code === "ACCOUNT_BANNED") {
      res.status(403).json({
        success: false,
        message: err.message,
        data: err.details, // Đặt thông tin ban vào data để FE dễ xử lý
        errors: null,
      });
      return;
    }
    next(err);
  }
};

// Register
export const registerController = async (
  req: Request,
  res: Response,
  next: NextFunction
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
  next: NextFunction
): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) {
      res.status(401).json(ApiResponse.fail("Refresh token missing"));
      return;
    }

    // 1. Kiểm tra session trong DB
    const session = await getUserSession(refreshToken);
    if (!session) {
      res.clearCookie("refreshToken");
      res.clearCookie("accessToken");
      res.status(403).json(ApiResponse.fail("Invalid or revoked refresh token"));
      return;
    }

    // 2. Verify token (Dùng dạng đồng bộ, vì đã có try-catch bọc ngoài)
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as any;
    } catch (verifyError) {
      // Xóa token rác trong DB nếu jwt tạch (tuỳ chọn)
      await deleteRefreshToken(refreshToken);
      res.clearCookie("refreshToken");
      res.clearCookie("accessToken");
      res.status(403).json(ApiResponse.fail("Invalid or expired refresh token"));
      return;
    }

    // 3. Cấp Access Token mới
    const { iat, exp, ...userData } = decoded;
    const accessToken = generateAccessTokenFromPayload(userData as UserPayload);

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: accessTokenExpiredTime,
    });

    res.status(200).json(ApiResponse.success(null, "Refresh token successfully"));
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
    res.clearCookie("accessToken");

    res.clearCookie("refreshToken");

    // delete refresh token trong db
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (refreshToken) {
      await deleteRefreshToken(refreshToken);
    }

    // Optionally: trả về message
    res.status(200).json(ApiResponse.success(null, "Logged out successfully"));
  } catch (err) {
    next(err);
  }
};

export const loginWithGoogleController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Missing idToken" });
    }

    const { accessToken, refreshToken, role_name, user_id } =
      await loginWithGoogleService(idToken);
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // đổi true nếu deploy HTTPS
      sameSite: "lax",
      maxAge: refreshTokenExpiredTime, // 7 ngày
    });

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // đổi true nếu deploy HTTPS
      sameSite: "lax",
      maxAge: accessTokenExpiredTime, // 15 phút
    });

    // Save user session to DB
    await saveUserSession({
      userId: user_id,
      refreshToken: refreshToken,
      device_info: req.headers["user-agent"] || "Unknown device",
      ip_address: req.ip || "Unknown IP",
      expires_at: new Date(Date.now() + refreshTokenExpiredTime),
    });

    res.status(200).json(
      ApiResponse.success(null, "Login successfully", {
        role_name: role_name,
      })
    );
  } catch (error: any) {
    // Xử lý lỗi account bị ban
    if (error.code === "ACCOUNT_BANNED") {
      res.status(403).json({
        success: false,
        message: error.message,
        data: error.details, // Đặt thông tin ban vào data để FE dễ xử lý
        errors: null,
      });
      return;
    }
    next(error);
  }
};
