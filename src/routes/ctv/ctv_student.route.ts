import express from "express";
import {
  getStudentsController,
  getStudentDetailController,
  getGroupReportsController,
} from "../../controllers/student.controller";
import { sendReminderController, getEmailLogsForStudentController } from '../../controllers/mail.controller';
import { markStudentInactiveController } from '../../controllers/student.controller';
import {
  createStudentCareConversationController,
  listStudentCareConversationsForCtvController,
} from "../../controllers/student_care_conversation.controller";

const router = express.Router();

// Danh sÃ¡ch há»c viÃªn
router.get("/", getStudentsController);

// Láº¥y lá»‹ch sá»­ email nháº¯c nhá»Ÿ
router.get('/:id/email-logs', getEmailLogsForStudentController);

router.get('/:id/care-conversations', listStudentCareConversationsForCtvController);
router.post('/:id/care-conversations', createStudentCareConversationController);

// Gá»­i email nháº¯c nhá»Ÿ (CTV)
router.post('/:id/send-reminder', sendReminderController);

// Chuyá»ƒn tráº¡ng thÃ¡i progress cá»§a há»c viÃªn sang inactive
router.post('/:id/mark-inactive', markStudentInactiveController);

// Chi tiáº¿t 1 há»c viÃªn
router.get('/:id', getStudentDetailController);

// BÃ¡o cÃ¡o nhÃ³m há»c viÃªn
router.get("/reports/all", getGroupReportsController);

export default router;

