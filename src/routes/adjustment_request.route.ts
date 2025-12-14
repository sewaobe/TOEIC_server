import express from "express";
import { adjustmentRequestController } from "../controllers/adjustment_request.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware"; // Giả sử có middleware này

const router = express.Router();

// Middleware xác thực cho tất cả routes
router.use(verifyAccessToken);

// Routes cho CTV
router.post("/", adjustmentRequestController.createRequest);
router.get(
  "/collaborator",
  adjustmentRequestController.getCollaboratorRequests
);
router.get(
  "/student-path/:studentId",
  adjustmentRequestController.getFullLearningPath
);
router.get(
  "/student/:studentId",
  adjustmentRequestController.getRequestsByStudentId
);

// Routes cho Student
router.get("/student", adjustmentRequestController.getStudentRequests);
router.put("/:id/respond", adjustmentRequestController.respondToRequest);

// Shared
router.get("/:id", adjustmentRequestController.getRequestById);

export default router;
