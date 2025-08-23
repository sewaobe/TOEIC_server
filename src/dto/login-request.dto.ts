import { z } from 'zod';

// Định nghĩa schema
export const LoginRequestDTO = z.object({
  email: z.string().min(1, 'Email is required').email('Email is invalid'),
  password: z.string().min(8, 'Password is required'),
});

// Tạo TypeScript type tự động từ schema
export type LoginRequestDTOType = z.infer<typeof LoginRequestDTO>;
