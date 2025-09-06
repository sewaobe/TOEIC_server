import { Router } from "express";
import * as commentController from "../controllers/comment.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";


const router = Router();

router.get("/test/:testId",verifyAccessToken, commentController.getCommentsByTest);
router.get("/:parentId/replies", commentController.getRepliesByComment);
router.post("/test/:testId",verifyAccessToken, commentController.createComment);


export default router;
