import { Router } from "express";
import {
    createTopicOfCollaborator,
    getAllTopicOfCollaborator,
    updateTopicOfCollaborator,
    deleteTopicOfCollaborator
} from "../../controllers/topic.controller";

const router = Router();

router.get('/', getAllTopicOfCollaborator);
router.post("/", createTopicOfCollaborator);

router.put("/:id", updateTopicOfCollaborator);

router.delete("/:id", deleteTopicOfCollaborator);

export default router;
