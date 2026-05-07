import { Router } from "express";
import { getProjectSimilarity } from "../controllers/similarity.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/:projectId",
  authMiddleware, // check if logged in or not
  getProjectSimilarity
);

export default router;