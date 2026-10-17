import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  addPortfolio,
  updatePortfolio,
  deletePortfolio,
  deleteMyAccount,
  exportMyData,
  getMe,
  getMyStats,
  updateMe,
} from "../controllers/dashboardController.js";
import * as security from "../controllers/securityController.js";

const router = Router();
router.use(requireAuth);
router.get("/me", getMe);
router.patch("/me", asyncHandler(updateMe));
router.get("/me/export", asyncHandler(exportMyData));
router.get("/me/stats", asyncHandler(getMyStats));
router.delete("/me", asyncHandler(deleteMyAccount));
router.get("/me/security", asyncHandler(security.get));
router.post("/me/security/code", asyncHandler(security.sendCode));
router.post("/me/security", asyncHandler(security.toggle));
router.post("/me/security/forget-devices", asyncHandler(security.forgetDevices));
router.post("/portfolio", requireRole("architect"), asyncHandler(addPortfolio));
router.patch("/portfolio/:id", requireRole("architect"), asyncHandler(updatePortfolio));
router.delete("/portfolio/:id", requireRole("architect"), asyncHandler(deletePortfolio));

export default router;
