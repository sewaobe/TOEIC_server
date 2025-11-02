import Router from 'express'
import { getAllShadowingPracticeController, getShadowingByIdController } from '../controllers/shadowing.controller';

const router = Router();

router.get("/", getAllShadowingPracticeController);
router.get("/:id", getShadowingByIdController);

export default router;