import { Router } from "express";
import { getCollaboratorDashboard } from "../../controllers/dashboard.controller";
import { verifyAccessToken } from "../../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/", getCollaboratorDashboard);

export default router;
