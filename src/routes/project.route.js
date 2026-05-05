import { Router } from "express";
import { createProject } from "../controllers/project.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js"; 
import { validate } from "../middlewares/validate.middleware.js";
import { createProjectSchema } from "../validators/project.validator.js";

const router = Router();

router.post(
  "/create", 
  authMiddleware, 
  validate(createProjectSchema), 
  createProject
);

export default router;