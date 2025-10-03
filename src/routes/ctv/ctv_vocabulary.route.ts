import { Router } from "express";
import {
    createVocabulary,
    updateVocabulary,
    deleteVocabulary,
    getTopicInfo
} from "../../controllers/vocabulary.controller";


const router = Router();

router.get("/:topicId/info", getTopicInfo);
router.post("/", createVocabulary);
router.put("/:id", updateVocabulary);
router.delete("/:id", deleteVocabulary);

export default router;
