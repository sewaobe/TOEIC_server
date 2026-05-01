import Router from "express";
import multer from "multer";
import {
  completeShadowingAttemptController,
  deleteShadowingAttemptBySessionController,
  getShadowingAttemptBySessionController,
  saveShadowingAttemptDraftController,
} from "../controllers/shadowing_attempt.controller";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

router.get("/session/:sessionId", getShadowingAttemptBySessionController);
router.post("/session/:sessionId/save-draft", saveShadowingAttemptDraftController);
router.post(
  "/session/:sessionId/complete",
  upload.single("audio"),
  completeShadowingAttemptController,
);
router.delete("/session/:sessionId", deleteShadowingAttemptBySessionController);

export default router;
