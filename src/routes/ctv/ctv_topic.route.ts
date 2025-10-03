import { Router } from "express";
import {
    createTopicOfCollaborator,
    getAllTopicOfCollaborator,
    updateTopicOfCollaborator,
    deleteTopicOfCollaborator
} from "../../controllers/topic.controller";
import { getVocabulariesByTopic } from "../../controllers/vocabulary.controller";

const router = Router();

router.get('/', getAllTopicOfCollaborator);
router.post("/", createTopicOfCollaborator);

// GET /api/topics/:topicId?page=1&limit=10
router.get("/:topicId", getVocabulariesByTopic);

router.put("/:id", updateTopicOfCollaborator);

router.delete("/:id", deleteTopicOfCollaborator);

export default router;
