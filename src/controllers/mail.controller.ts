import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { User } from '../models/user.model';
import { EmailLog } from '../models/emailLog.model';
import { sendOtpEmail, sendCustomEmail } from '../services/mail.service';
import { ApiResponse } from '../utils/ApiResponse';
import { Types } from 'mongoose';

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
      { passwordHash: hashed },
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

// ==========================
// 📧 Gửi email nhắc nhở học viên
// ==========================
const SendReminderSchema = z.object({
  template: z.object({
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
});

export const sendReminderController = async (
  req: Request<{ id: string }, unknown, z.infer<typeof SendReminderSchema>>,
  res: Response,
) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) return res.status(400).json(ApiResponse.fail('ID không hợp lệ'));

    const parsed = SendReminderSchema.parse(req.body);
    const { template } = parsed;

    const user = await User.findById(id).lean();
    if (!user || !user.email) return res.status(404).json(ApiResponse.fail('Không tìm thấy học viên hoặc email'));

    // Gửi email: nếu body đã chứa HTML tag thì dùng nguyên văn,
    // còn nếu là plain-text (ví dụ có \n) thì chuyển thành HTML có <p> / <br/> để giữ format.
    let htmlBody = template.body || "";
    const containsHtmlTag = /<[^>]+>/.test(htmlBody);
    if (!containsHtmlTag) {
      // escape HTML special chars
      const escaped = htmlBody
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      // Split paragraphs by double newlines, convert single newlines to <br/>
      const paragraphs = escaped.split(/\n\s*\n/).map((p) => p.replace(/\n/g, '<br/>'));
      htmlBody = `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">${paragraphs.map(p => `<p>${p}</p>`).join('')}</div>`;
    }

    await sendCustomEmail(user.email, template.subject, htmlBody);

    // Ghi log email
    try {
      const collaboratorId = (req as any).user?._id || null;
      await EmailLog.create({
        student_id: user._id,
        collaborator_id: collaboratorId,
        subject: template.subject,
        body_html: htmlBody,
        sent_at: new Date(),
        channel: 'email',
        meta: {},
      });
    } catch (logErr) {
      console.warn('Failed to write EmailLog', logErr);
    }

    return res.json(ApiResponse.success(null, 'Email nhắc nhở đã được gửi'));
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json(ApiResponse.fail(err.issues[0]?.message));
    console.error('sendReminderController error', err);
    return res.status(500).json(ApiResponse.fail('Lỗi khi gửi email'));
  }
};

// ==========================
// 📬 Lấy lịch sử email của 1 học viên (CTV)
// ==========================
export const getEmailLogsForStudentController = async (
  req: Request<{ id: string }>,
  res: Response,
) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) return res.status(400).json(ApiResponse.fail('ID không hợp lệ'));

    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const skip = (page - 1) * limit;

    const student_id = new Types.ObjectId(id);
    const filter = { student_id: student_id };
    const total = await EmailLog.countDocuments(filter);
    const items = await EmailLog.find(filter).sort({ sent_at: -1 }).skip(skip).limit(limit).lean();
    const pageCount = Math.ceil(total / limit);

    return res.json(ApiResponse.success({ items, total, pageCount }, 'Lịch sử email'));
  } catch (err: any) {
    console.error('getEmailLogsForStudentController error', err);
    return res.status(500).json(ApiResponse.fail('Lỗi server'));
  }
};
