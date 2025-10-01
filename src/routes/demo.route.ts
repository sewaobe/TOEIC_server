import { Router } from "express";
import { demo } from "../controllers/demo.controller";

const router = Router();

router.get("/", demo);

export default router;