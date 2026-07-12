import express from "express";
import {
  addCtvSolutionController,
  getCtvCareConversationDetailController,
  resolveCareConversationController,
  updateFollowUpController,
} from "../../controllers/student_care_conversation.controller";

const router = express.Router();

router.get("/:id", getCtvCareConversationDetailController);
router.patch("/:id/solution", addCtvSolutionController);
router.patch("/:id/follow-up", updateFollowUpController);
router.patch("/:id/resolve", resolveCareConversationController);

export default router;

