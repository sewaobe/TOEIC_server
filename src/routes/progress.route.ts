import Router from 'express';
import { getTotalScoreTestInMonthController, getTotalUserTestInMonthController, getSkillsOverviewController, getSkillActivitiesController, getPartAccuracyStatsController } from '../controllers/progress.controller';

const router = Router();

router.get("/overview", getTotalScoreTestInMonthController);
router.get("/user-tests", getTotalUserTestInMonthController);

// 🎯 API mới cho PracticeSkillPanel
router.get("/skills-overview", getSkillsOverviewController);
router.get("/skill-activities/:skillType", getSkillActivitiesController);

// 📊 API cho AccuracyComparisonChart
router.get("/part-accuracy", getPartAccuracyStatsController);

export default router;