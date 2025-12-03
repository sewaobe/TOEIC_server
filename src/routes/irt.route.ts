import Router from 'express';
import { generateIrtWeeklyPlanController } from '../controllers/irt.controller';

const router = Router();

router.post('/weekly-plan', generateIrtWeeklyPlanController);

export default router;