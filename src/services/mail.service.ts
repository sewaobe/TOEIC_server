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
