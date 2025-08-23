import { z } from 'zod';

// Định nghĩa schema cho đăng ký
export const RegisterRequestDTO = z.object({
  email: z.string().min(1, 'Email is required').email('Email invalid'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  username: z.string().min(8, 'Username must be at least 8 characters long'),
  fullName: z.string().min(1, 'Fullname is required'),
});

// Tạo TypeScript type tự động từ schema
export type RegisterRequestDTOType = z.infer<typeof RegisterRequestDTO>;
