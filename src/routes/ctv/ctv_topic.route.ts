import { Router } from "express";
import { getAllTopicOfCollaborator } from "../../controllers/topic.controller";

const router = Router();

router.get('/', getAllTopicOfCollaborator);
export default router;
