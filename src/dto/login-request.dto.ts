import { z } from 'zod';
import is from 'zod/v4/locales/is.cjs';

// Định nghĩa schema
export const LoginRequestDTO = z.object({
  username: z.string().min(8, 'Username must be at least 8 characters long'),
  password: z.string().min(8, 'Password is required'),
  isRemember: z.boolean().optional().default(false),
});

// Tạo TypeScript type tự động từ schema
export type LoginRequestDTOType = z.infer<typeof LoginRequestDTO>;
