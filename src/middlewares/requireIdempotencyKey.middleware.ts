import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";

const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

export const requireIdempotencyKey = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const rawKey = req.header("Idempotency-Key");
  const idempotencyKey = rawKey?.trim();

  if (!idempotencyKey) {
    return res
      .status(400)
      .json(ApiResponse.fail("Idempotency-Key header is required"));
  }

  if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return res
      .status(400)
      .json(ApiResponse.fail("Idempotency-Key header is too long"));
  }

  req.idempotencyKey = idempotencyKey;
  return next();
};
