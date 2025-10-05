import { Router } from "express";
import {
  createGroupController,
  getGroupByIdController,
  updateGroupController,
  deleteGroupController,
  getQuestionsWithGroupInfoController,
} from "../../controllers/group.controller";
// import { verifyAccessToken } from "../../middlewares/verifyAccessToken.middleware";

const router = Router();


// ✅ Tạo group mới
router.post("/create", createGroupController);
router.get("/questions/get-all", getQuestionsWithGroupInfoController);
router.get("/:id", getGroupByIdController);
router.put("/:id", updateGroupController);
router.delete("/:groupId", deleteGroupController);


export default router;
