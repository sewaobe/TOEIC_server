import Router from 'express'
import { getAllDictationPracticeController, getDictationByIdController } from '../controllers/dictation.controller';

const router = Router();

router.get("/", getAllDictationPracticeController);
router.get("/:id", getDictationByIdController);

export default router;