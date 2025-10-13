import express from "express"
import {
  loginController,
  loginWithGoogleController,
  logoutController,
  refreshTokenController,
  registerController,
} from "../controllers/auth.controller"
import { validateSchema } from "../validations/validate-schema.validation"
import { LoginRequestDTO } from "../dto/login-request.dto"
import { RegisterRequestDTO } from "../dto/register-request.dto"
import {
  requestOtp,
  resetPassword,
  verifyOtp,
} from "../controllers/mail.controller"

const router = express.Router()

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Đăng nhập tài khoản người dùng
 *     description: Gửi email và mật khẩu để đăng nhập. API sẽ trả về accessToken và refreshToken được lưu trong cookie, cùng role_name trong response body.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Login successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     role_name:
 *                       type: string
 *                       example: student
 *       401:
 *         description: Sai thông tin đăng nhập hoặc tài khoản bị khóa
 */
router.post("/login", validateSchema(LoginRequestDTO), loginController)

/**
 * @openapi
 * /auth/google:
 *   post:
 *     summary: Đăng nhập bằng Google
 *     description: Gửi Google ID token để xác thực và nhận cookie accessToken, refreshToken.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *                 example: eyJhbGciOiJSUzI1NiIsImtpZCI6ImE1YTAwNWU5N2NiMWU0MjczMDBlNTJjZGQ1MGYwYjM2Y2Q4MDYyOWIiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiTmd1eWVuIFBodWMgQmFvIiwicGljdHVyZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0pwMDltQ2dzelBXOEY0bGZ4UHlfcFVkWlJNcTRZekhyaWxKZ0M2UU8zVmR2WFRtdz1zOTYtYyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS90b2VpYy1hdXRoIiwiYXVkIjoidG9laWMtYXV0aCIsImF1dGhfdGltZSI6MTc2MDI4NjM1NSwidXNlcl9pZCI6InhaYWxLMHUzcWVmdnB5aWdER3JrbzFYQk9wSDIiLCJzdWIiOiJ4WmFsSzB1M3FlZnZweWlnREdya28xWEJPcEgyIiwiaWF0IjoxNzYwMjg2MzU1LCJleHAiOjE3NjAyODk5NTUsImVtYWlsIjoiMjIxMTAyODVAc3R1ZGVudC5oY211dGUuZWR1LnZuIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZ29vZ2xlLmNvbSI6WyIxMTYxNjg1OTU4NTkzMDAxMDg4MjYiXSwiZW1haWwiOlsiMjIxMTAyODVAc3R1ZGVudC5oY211dGUuZWR1LnZuIl19LCJzaWduX2luX3Byb3ZpZGVyIjoiZ29vZ2xlLmNvbSJ9fQ.DpDjcY4Pjuzwo-nDSeixvUKtfUbLIgPXjBe6eDMosMxv7lfyeoSvh17uqyuMppGXVCC5XBuGw4LFZcQEgnlkbPkDTs7nd7yE-M_L-IIdYmksuFGLzV8kYPCLsnyq5oyOHOjCdogtn-BS_pMGxp1sC0AfqPsdAHGcskBX9r3pYoBeGwlfmqfjkm1v-JvrkwVUwRWzFQecf27GUMNZfS16YoYzuZyPy8mRgaroXeocig1ToAO5_jIA-OD7rKGjzkTa_mDgLs6vdpnDsppkCLMCdWi1kkkkQR0F5cmSBf-giQl1gDDvGkufjGzvW4ZP1vqPBKNrVphxNY26fc85KWm1Iw
 *     responses:
 *       200:
 *         description: Đăng nhập Google thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     role_name:
 *                       type: string
 *                       example: student
 *       400:
 *         description: Thiếu idToken
 *       401:
 *         description: Xác thực Google thất bại
 */
router.post("/google", loginWithGoogleController)

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Đăng ký tài khoản mới
 *     description: Gửi thông tin người dùng mới để đăng ký tài khoản.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - full_name
 *             properties:
 *               email:
 *                 type: string
 *                 example: newuser@example.com
 *               password:
 *                 type: string
 *                 example: 123456
 *               full_name:
 *                 type: string
 *                 example: Nguyen Van A
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Register successfully
 *       400:
 *         description: Email đã tồn tại hoặc dữ liệu không hợp lệ
 */
router.post("/register", validateSchema(RegisterRequestDTO), registerController)

/**
 * @openapi
 * /auth/refresh-token:
 *   get:
 *     summary: Làm mới accessToken bằng refreshToken
 *     description: API đọc refreshToken từ cookie, kiểm tra hợp lệ và trả về accessToken mới (cũng set trong cookie).
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Làm mới accessToken thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Refresh token successfully
 *       401:
 *         description: Thiếu refreshToken trong cookie
 *       403:
 *         description: RefreshToken hết hạn hoặc không hợp lệ
 */
router.get("/refresh-token", refreshTokenController)

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Đăng xuất tài khoản
 *     description: Xóa cookie accessToken và refreshToken.
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 */
router.post("/logout", logoutController)

/**
 * @openapi
 * /auth/request-otp:
 *   post:
 *     summary: Gửi mã OTP đến email người dùng
 *     description: Dùng để yêu cầu mã OTP phục vụ quên mật khẩu.
 *     tags:
 *       - Password Reset
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Gửi OTP thành công
 *       400:
 *         description: Email không tồn tại
 */
router.post("/request-otp", requestOtp)

/**
 * @openapi
 * /auth/verify-otp:
 *   post:
 *     summary: Xác minh mã OTP
 *     description: Kiểm tra OTP người dùng nhập để xác thực reset mật khẩu.
 *     tags:
 *       - Password Reset
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               otp:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: OTP hợp lệ
 *       400:
 *         description: OTP sai hoặc hết hạn
 */
router.post("/verify-otp", verifyOtp)

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: Đặt lại mật khẩu mới
 *     description: Gửi email và mật khẩu mới để đặt lại mật khẩu sau khi xác minh OTP thành công.
 *     tags:
 *       - Password Reset
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               newPassword:
 *                 type: string
 *                 example: newpassword123
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 */
router.post("/reset-password", resetPassword)

export default router
