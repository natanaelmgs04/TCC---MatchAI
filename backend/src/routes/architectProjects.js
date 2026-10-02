import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { listArchitectProjects } from "../controllers/projectController.js";

const router = Router();
router.use(requireAuth, requireRole("architect"));
router.get("/", asyncHandler(listArchitectProjects));
export default router;
