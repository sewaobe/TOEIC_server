import { Request, Response, NextFunction } from "express";

/**
 * Middleware kiểm tra vai trò người dùng.
 * @param allowedRoles - Danh sách vai trò được phép truy cập route.
 * 
 * Ví dụ: checkRole('admin', 'collaborator')
 */
export const checkRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Nếu chưa được xác thực
      if (!req.user) {
        res.status(401).json({ message: "Chưa đăng nhập hoặc token không hợp lệ" });
        return;
      }

      const userRole = (req.user as any).roleName;

      // Nếu không nằm trong danh sách vai trò cho phép
      if (!allowedRoles.includes(userRole)) {
        res.status(403).json({ message: "Không có quyền truy cập tài nguyên này" });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({ message: "Lỗi kiểm tra vai trò", error });
    }
  };
};
