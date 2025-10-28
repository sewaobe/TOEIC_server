import nodemailer from 'nodemailer';
console.log('Nodemailer', process.env.GMAIL_USER);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS, // App Password 16 ký tự
  },
  tls: {
    rejectUnauthorized: false,
  },
});
export async function sendOtpEmail(to: string, otp: string) {
  const mail = await transporter.sendMail({
    from: `"Reset Password" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your OTP Code (Valid for 5 minutes)',
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif; line-height:1.6">
        <h2>Reset your password</h2>
        <p>Mã OTP của bạn là:</p>
        <p style="font-size:24px; font-weight:700; letter-spacing:4px">${otp}</p>
        <p>OTP có hiệu lực trong <b>5 phút</b>. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
      </div>
    `,
  });
  return mail.messageId;
}

/**
 * Gửi email cảm ơn khi người dùng đã gửi form đăng ký cộng tác viên.
 * @param to email người nhận
 * @param fullname họ tên người nhận
 */
export async function sendCollaboratorThankyouEmail(to: string, fullname: string) {
  const htmlContent = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;background-color:#f9fafb;padding:32px;color:#333;">
    <div style="max-width:600px;margin:0 auto;background-color:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.08);overflow:hidden;">
      
      <!-- Header / Logo -->
      <div style="background:linear-gradient(90deg,#06b6d4,#2563eb);padding:20px 0;text-align:center;">
        <img src="https://i.imgur.com/3I4fRzP.png" alt="TOEIC Master Logo" width="90" style="border-radius:8px;">
        <h1 style="color:#fff;margin-top:8px;font-size:20px;letter-spacing:0.5px;">TOEIC Master</h1>
      </div>

      <!-- Body -->
      <div style="padding:28px;">
        <h2 style="color:#06b6d4;margin-bottom:12px;">Xin chào ${fullname},</h2>
        <p style="font-size:15px;line-height:1.6;">
          Cảm ơn bạn đã gửi đơn <b>đăng ký trở thành Cộng tác viên TOEIC Master</b>! 🎉
        </p>
        <p style="font-size:15px;line-height:1.6;">
          Chúng tôi đã nhận được thông tin của bạn và sẽ xem xét hồ sơ trong vòng 
          <b>3–5 ngày làm việc</b>. Sau khi đánh giá, đội ngũ tuyển dụng sẽ liên hệ qua email của bạn để thông báo kết quả hoặc mời phỏng vấn.
        </p>
        <p style="font-size:15px;line-height:1.6;">
          Trong thời gian này, bạn có thể xem thêm chi tiết về các vị trí, quyền lợi và tiêu chí tại trang tuyển dụng của chúng tôi:
        </p>

        <!-- CTA Button -->
        <div style="text-align:center;margin:28px 0;">
          <a href="http://localhost:5174" target="_blank" rel="noopener" 
            style="display:inline-block;padding:12px 28px;background:linear-gradient(90deg,#06b6d4,#2563eb);
            color:#fff;font-weight:600;border-radius:6px;text-decoration:none;letter-spacing:0.3px;
            box-shadow:0 3px 10px rgba(6,182,212,0.3);">
            Xem thông tin chi tiết hơn tại TOEIC Master
          </a>
        </div>

        <p style="font-size:14px;color:#555;">
          Vui lòng kiểm tra hộp thư thường xuyên (bao gồm thư mục <em>Spam / Quảng cáo</em>) để không bỏ lỡ phản hồi từ chúng tôi.
        </p>
      </div>

      <!-- Footer -->
      <div style="background-color:#f3f4f6;padding:18px;text-align:center;font-size:13px;color:#666;">
        <p style="margin:4px 0;">Trân trọng,</p>
        <p style="margin:4px 0;"><b>Đội ngũ TOEIC Master</b></p>
        <p style="margin:4px 0;">
          📧 <a href="mailto:${process.env.GMAIL_USER}" style="color:#06b6d4;text-decoration:none;">${process.env.GMAIL_USER}</a>
        </p>
        <p style="margin-top:8px;font-size:12px;color:#aaa;">
          © ${new Date().getFullYear()} TOEIC Master. All rights reserved.
        </p>
      </div>
    </div>
  </div>
  `;

  const mail = await transporter.sendMail({
    from: `"TOEIC Master" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Cảm ơn bạn đã đăng ký Cộng tác viên TOEIC Master!",
    html: htmlContent,
  });

  return mail.messageId;
}

/**
 * Gửi email thông báo kết quả duyệt đơn cộng tác viên
 * @param to email người nhận
 * @param fullname họ tên người nhận
 * @param status "accepted" | "rejected"
 * @param note ghi chú thêm (optional)
 */
export async function sendCollaboratorReviewEmail(
  to: string,
  fullname: string,
  status: "approved" | "rejected",
  note?: string
) {
  const isAccepted = status === "approved";

  const title = isAccepted
    ? "Chúc mừng bạn đã được chọn làm Cộng tác viên TOEIC Master!"
    : "Kết quả đánh giá đơn đăng ký Cộng tác viên TOEIC Master";

  const themeColor = isAccepted ? "#10b981" : "#ef4444"; // xanh lá hoặc đỏ
  const gradient = isAccepted
    ? "linear-gradient(90deg,#10b981,#059669)"
    : "linear-gradient(90deg,#ef4444,#b91c1c)";
  const emoji = isAccepted ? "🎉" : "🙏";

  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;background-color:#f9fafb;padding:32px;color:#333;">
    <div style="max-width:600px;margin:0 auto;background-color:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.08);overflow:hidden;">
      
      <!-- Header -->
      <div style="background:${gradient};padding:20px 0;text-align:center;">
        <img src="https://i.imgur.com/3I4fRzP.png" alt="TOEIC Master Logo" width="85" style="border-radius:8px;">
        <h1 style="color:#fff;margin-top:8px;font-size:20px;letter-spacing:0.5px;">TOEIC Master</h1>
      </div>

      <div style="padding:28px;">
        <h2 style="color:${themeColor};margin-bottom:12px;">Xin chào ${fullname},</h2>
        
        ${
          isAccepted
            ? `
            <p style="font-size:15px;line-height:1.6;">
              ${emoji} <b>Chúc mừng!</b> Sau khi xem xét hồ sơ, chúng tôi rất ấn tượng với kinh nghiệm và động lực của bạn.
            </p>
            <p style="font-size:15px;line-height:1.6;">
              Bạn đã được <b>chấp nhận trở thành Cộng tác viên TOEIC Master</b>.
            </p>
            <p style="font-size:15px;line-height:1.6;">
              Trong 24h tới, đội ngũ của chúng tôi sẽ liên hệ qua email hoặc điện thoại để hoàn tất thủ tục onboard.
            </p>
            ${
              note
                ? `<p style="margin-top:12px;font-size:14px;color:#555;">Ghi chú từ đội ngũ tuyển dụng: ${note}</p>`
                : ""
            }
            <div style="text-align:center;margin:28px 0;">
              <a href="https://toeicmaster.vn/onboard"
                 style="display:inline-block;padding:12px 28px;background:${gradient};
                 color:#fff;font-weight:600;border-radius:6px;text-decoration:none;
                 box-shadow:0 3px 10px rgba(16,185,129,0.3);">
                 Bắt đầu hành trình cùng TOEIC Master
              </a>
            </div>
          `
            : `
            <p style="font-size:15px;line-height:1.6;">
              ${emoji} Cảm ơn bạn đã quan tâm và dành thời gian gửi hồ sơ đến <b>TOEIC Master</b>.
            </p>
            <p style="font-size:15px;line-height:1.6;">
              Sau khi xem xét kỹ, chúng tôi rất tiếc phải thông báo rằng hồ sơ của bạn <b>chưa phù hợp</b> với vị trí hiện tại.
            </p>
            <p style="font-size:15px;line-height:1.6;">
              Tuy nhiên, chúng tôi sẽ lưu thông tin của bạn và sẽ liên hệ nếu có cơ hội phù hợp trong tương lai.
            </p>
            ${
              note
                ? `<p style="margin-top:12px;font-size:14px;color:#555;">Ghi chú từ đội ngũ tuyển dụng: ${note}</p>`
                : ""
            }
            <div style="text-align:center;margin:28px 0;">
              <a href="https://toeicmaster.vn/collaborator"
                 style="display:inline-block;padding:12px 28px;background:${gradient};
                 color:#fff;font-weight:600;border-radius:6px;text-decoration:none;
                 box-shadow:0 3px 10px rgba(239,68,68,0.3);">
                 Xem lại tiêu chí tuyển dụng
              </a>
            </div>
          `
        }
      </div>

      <div style="background-color:#f3f4f6;padding:18px;text-align:center;font-size:13px;color:#666;">
        <p style="margin:4px 0;">Trân trọng,</p>
        <p style="margin:4px 0;"><b>Đội ngũ TOEIC Master</b></p>
        <p style="margin:4px 0;">
          📧 <a href="mailto:${process.env.GMAIL_USER}" style="color:${themeColor};text-decoration:none;">${process.env.GMAIL_USER}</a>
        </p>
        <p style="margin-top:8px;font-size:12px;color:#aaa;">
          © ${new Date().getFullYear()} TOEIC Master. All rights reserved.
        </p>
      </div>
    </div>
  </div>
  `;

  const mail = await transporter.sendMail({
    from: `"TOEIC Master" <${process.env.GMAIL_USER}>`,
    to,
    subject: title,
    html,
  });

  return mail.messageId;
}