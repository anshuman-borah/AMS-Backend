import { Router } from "express";
import { getSimilarityStatus } from "../controllers/similarity.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/:projectId/similarity-status", authMiddleware, getSimilarityStatus);

export default router;