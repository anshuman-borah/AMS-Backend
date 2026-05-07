import { Router } from "express";

import {
  createProject,
  updateProject,
  submitProject
} from "../controllers/project.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";

import { validate } from "../middlewares/validate.middleware.js";

import {
  createProjectSchema,
  updateProjectSchema
} from "../validators/project.validator.js";

const router = Router();

router.post(
  "/create", 
  authMiddleware, 
  validate(createProjectSchema), 
  createProject
);

router.patch(
  "/:id",
  authMiddleware,
  validate(updateProjectSchema),
  updateProject
);

router.patch(
  "/:id/submit",
  authMiddleware,
  submitProject
);

export default router;