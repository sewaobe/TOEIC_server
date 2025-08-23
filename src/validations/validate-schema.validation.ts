import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';

type RequestType = 'body' | 'query' | 'params';

export const validateSchema = <T extends ZodSchema>(
  schema: T,
  type: RequestType = 'body',
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req[type] = schema.parse(req[type]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // dùng 'issues' thay vì 'errors'
        const formattedErrors = err.issues.map((issue: ZodIssue) => ({
          field: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        }));

        return res
          .status(400)
          .json({ message: 'Validation failed', errors: formattedErrors });
      }

      return res
        .status(500)
        .json({ message: (err as Error).message || 'System error' });
    }
  };
};
