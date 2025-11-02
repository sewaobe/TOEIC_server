import Router from 'express';
import { createDictationAttemptController } from '../controllers/dictation_attempt.controller';

const router = Router();

router.post("/", createDictationAttemptController);

export default router;