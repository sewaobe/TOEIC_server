import express from "express";
import {
  createQuizController,
  updateQuizController,
  deleteQuizController,
  getAllQuizController,
  getQuizByIdController,
} from "../../controllers/quiz.controller";

const router = express.Router();

router.post("/", createQuizController);
router.get("/", getAllQuizController);
router.get("/:id", getQuizByIdController);
router.put("/:id", updateQuizController);
router.delete("/:id", deleteQuizController);

export default router;
