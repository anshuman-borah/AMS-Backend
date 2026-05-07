import { Router } from "express";
import { createProject } from "../controllers/project.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js"; 
import { validate } from "../middlewares/validate.middleware.js";
import { createProjectSchema } from "../validators/project.validator.js";
import assignReviewer from "../controllers/assignReviewer.controller.js";
import roleMiddleware from "../middlewares/role.middleware.js";

const router = Router();

router.post(
  "/create", 
  authMiddleware, 
  validate(createProjectSchema), 
  createProject
);

router.put(
  "/assign-reviewer/:projectId",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  assignReviewer
);

export default router;