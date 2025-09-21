import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { User } from '../models/user.model';
import { sendOtpEmail } from '../services/mail.service';
import { ApiResponse } from '../utils/ApiResponse';

// ===== In-memory OTP store =====
type OtpEntry = {
  otp: string;
  createdAt: number;
  verified: boolean;
};
const otpStore = new Map<string, OtpEntry>();
const OTP_TTL_MS = 5 * 60 * 1000;

// ===== DTO Schemas =====
const RequestOtpSchema = z.object({
  email: z.string().email(),
});
type RequestOtpRequest = z.infer<typeof RequestOtpSchema>;
type RequestOtpResponse = { message: string };

const VerifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/),
});
type VerifyOtpRequest = z.infer<typeof VerifyOtpSchema>;
type VerifyOtpResponse = { success: boolean; message?: string };

const ResetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(6),
});
type ResetPasswordRequest = z.infer<typeof ResetPasswordSchema>;
type ResetPasswordResponse = { success: boolean; message: string };

// ===== Helpers =====
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function isExpired(entry: OtpEntry): boolean {
  return Date.now() - entry.createdAt > OTP_TTL_MS;
}

// Clean-up định kỳ
setInterval(() => {
  for (const [email, entry] of otpStore.entries()) {
    if (isExpired(entry)) otpStore.delete(email);
  }
}, 60 * 1000);

// ===== Controllers =====
export const requestOtp = async (
  req: Request<unknown, unknown, RequestOtpRequest>,
  res: Response<RequestOtpResponse>,
) => {
  try {
    const { email } = RequestOtpSchema.parse(req.body);

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Email không tồn tại' });

    const otp = generateOtp();
    otpStore.set(email, { otp, createdAt: Date.now(), verified: false });
    console.log(user, otp);
    await sendOtpEmail(email, otp);

    return res.json({ message: 'OTP đã được gửi' });
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ message: err.issues[0]?.message });
    console.error(err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
};

export const verifyOtp = async (
  req: Request<unknown, unknown, VerifyOtpRequest>,
  res: Response<VerifyOtpResponse>,
) => {
  try {
    const { email, otp } = VerifyOtpSchema.parse(req.body);
    const entry = otpStore.get(email);
    if (!entry || isExpired(entry)) {
      otpStore.delete(email);
      return res
        .status(400)
        .json({ success: false, message: 'OTP không tồn tại hoặc đã hết hạn' });
    }
    if (entry.otp !== otp)
      return res
        .status(400)
        .json({ success: false, message: 'OTP không đúng' });

    entry.verified = true;
    otpStore.set(email, entry);
    return res.json({ success: true, message: 'OTP hợp lệ' });
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({ success: false, message: err.issues[0]?.message });
    console.error(err);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

export const resetPassword = async (
  req: Request<unknown, unknown, ResetPasswordRequest>,
  res: Response<ResetPasswordResponse>,
) => {
  try {
    const { email, otp, newPassword } = ResetPasswordSchema.parse(req.body);
    const entry = otpStore.get(email);
    if (!entry || isExpired(entry)) {
      otpStore.delete(email);
      return res
        .status(400)
        .json(ApiResponse.fail('OTP không tồn tại hoặc đã hết hạn'));
    }
    if (!entry.verified)
      return res
        .status(400)
        .json(ApiResponse.fail('OTP chưa xác thực'));

    if (entry.otp !== otp)
      return res
        .status(400)
        .json(ApiResponse.fail('OTP không đúng'));

    const hashed = await bcrypt.hash(newPassword, 10);
    const user = await User.findOneAndUpdate(
      { email },
      { password: hashed },
      { new: true },
    );
    if (!user)
      return res
        .status(404)
        .json(ApiResponse.fail('Không tìm thấy user'));

    otpStore.delete(email);
    return res.json(ApiResponse.success(null, 'Đặt lại mật khẩu thành công'));
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json(ApiResponse.fail(err.issues[0]?.message));
    console.error(err);
    return res.status(500).json(ApiResponse.fail('Lỗi server'));

  }
};
