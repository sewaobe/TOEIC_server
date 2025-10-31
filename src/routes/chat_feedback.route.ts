import Router from 'express';
import { submitChatFeedbackController } from '../controllers/chat_feedback.controller';

const router = Router();

router.post('/', submitChatFeedbackController);

export default router;