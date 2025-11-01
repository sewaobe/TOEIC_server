import { Router } from "express";
import * as reportController from "../controllers/report.controller";

const router = Router();

router.post("/", reportController.createReport);
router.get("/", reportController.getMyReports);
router.get("/:reportId", reportController.getMyReportDetail);

export default router;
