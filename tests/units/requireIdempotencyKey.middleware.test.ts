import { NextFunction, Request, Response } from "express";
import { requireIdempotencyKey } from "../../src/middlewares/requireIdempotencyKey.middleware";

const createResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  return res as unknown as Response;
};

const createRequest = (headerValue?: string) => {
  return {
    header: jest.fn().mockReturnValue(headerValue),
  } as unknown as Request;
};

describe("requireIdempotencyKey", () => {
  it("requireIdempotencyKey -> Missing header -> Returns400", () => {
    // Arrange
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    // Act
    requireIdempotencyKey(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Idempotency-Key header is required",
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("requireIdempotencyKey -> Blank header -> Returns400", () => {
    // Arrange
    const req = createRequest("   ");
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    // Act
    requireIdempotencyKey(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Idempotency-Key header is required",
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("requireIdempotencyKey -> Valid header -> AttachesKeyAndCallsNext", () => {
    // Arrange
    const req = createRequest(" key-123 ");
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    // Act
    requireIdempotencyKey(req, res, next);

    // Assert
    expect(req.idempotencyKey).toBe("key-123");
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
