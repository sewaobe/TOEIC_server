import Router from 'express';
import { createChatSessionController, deleteChatSessionController, getAllChatMessageInSessionController, getChatSessionByUserIdController, processUserMessageController } from '../controllers/chat.controller';

const router = Router();

router.post("/session", createChatSessionController);
router.get("/session", getChatSessionByUserIdController);
router.delete("/session/:sessionId", deleteChatSessionController);
router.get("/message/:sessionId", getAllChatMessageInSessionController);
router.post("/message", processUserMessageController);

export default router;