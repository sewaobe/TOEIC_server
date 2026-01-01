import express from "express";
import {
  getStudentsController,
  getStudentDetailController,
  getGroupReportsController,
} from "../../controllers/student.controller";
import { sendReminderController, getEmailLogsForStudentController } from '../../controllers/mail.controller';
import { markStudentInactiveController } from '../../controllers/student.controller';

const router = express.Router();

// Danh sách học viên
router.get("/", getStudentsController);

// Lấy lịch sử email nhắc nhở
router.get('/:id/email-logs', getEmailLogsForStudentController);

// Gửi email nhắc nhở (CTV)
router.post('/:id/send-reminder', sendReminderController);

// Chuyển trạng thái progress của học viên sang inactive
router.post('/:id/mark-inactive', markStudentInactiveController);

// Chi tiết 1 học viên
router.get('/:id', getStudentDetailController);

// Báo cáo nhóm học viên
router.get("/reports/all", getGroupReportsController);

export default router;
