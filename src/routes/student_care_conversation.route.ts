import express from "express";
import {
  getStudentCareConversationDetailController,
  listStudentPendingCareConversationsController,
  respondStudentCareConversationController,
} from "../controllers/student_care_conversation.controller";

const router = express.Router();

router.get("/pending", listStudentPendingCareConversationsController);
router.get("/:id", getStudentCareConversationDetailController);
router.post("/:id/respond", respondStudentCareConversationController);

export default router;

