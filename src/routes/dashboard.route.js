import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import  getScientistDashboard  from "../controllers/scientistDashboard.controller.js";
import RoleMiddleware from "../middlewares/role.middleware.js";

const router = Router();

router.get("/scientist", authMiddleware,
    RoleMiddleware("SCIENTIST"),
     getScientistDashboard);

export default router;