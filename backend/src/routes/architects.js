import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getArchitectProfile,
  getArchitectReferenceImage,
  listArchitects,
  recordProfileView,
  setSubscriptionTier,
} from "../controllers/architectController.js";
import { listClosedProjects } from "../controllers/hireController.js";
const router = Router();
const referenceImageLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30 });
const viewLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60 });
router.get("/", asyncHandler(listArchitects));
router.post("/me/subscription", requireAuth, requireRole("architect"), asyncHandler(setSubscriptionTier));
router.get("/:id/reference-image", referenceImageLimiter, asyncHandler(getArchitectReferenceImage));
router.post("/:id/view", viewLimiter, asyncHandler(recordProfileView));
router.get("/:id/closed-projects", asyncHandler(listClosedProjects));
router.get("/:id", asyncHandler(getArchitectProfile));
export default router;
