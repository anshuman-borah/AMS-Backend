import { Router } from "express";

import {
  createProject,
  updateProject,
  submitProject
} from "../controllers/project.controller.js";
import { getSimilarityStatus } from "../controllers/similarity.controller.js";
import assignReviewer from "../controllers/assignReviewer.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import roleMiddleware from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

import {
  createProjectSchema
  
} from "../validators/project.validator.js";

const router = Router();

router.post(
  "/create",
  authMiddleware,
  validate(createProjectSchema),
  createProject
);

router.patch(
  "/:projectId",
  authMiddleware,
  validate(createProjectSchema),
  updateProject
);

router.patch(
  "/:id/submit",
  authMiddleware,
  submitProject
);


// Check similarity status for a project
router.get("/:projectId/similarity-status", authMiddleware, getSimilarityStatus);

router.put(
  "/assign-reviewer/:projectId",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  assignReviewer
);

export default router;