import { Router } from "express";
import { checkRole } from "../../middlewares/checkRole.middleware";
import * as adminReportController from "../../controllers/admin/admin.report.controller";

const router = Router();

router.use(checkRole("admin"));

router.get("/", adminReportController.getReports);
router.get("/:reportId", adminReportController.getReportDetail);
router.put("/:reportId", adminReportController.updateReport);

export default router;
