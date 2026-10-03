import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as admin from "../controllers/adminController.js";

/** Painel da equipe (admin.html) — login + e-mail em ADMIN_EMAILS. */
const router = Router();
router.use(requireAuth, requireAdmin);
router.get("/me", admin.me);
router.get("/overview", asyncHandler(admin.overview));
router.get("/users", asyncHandler(admin.listUsers));
router.get("/users.csv", asyncHandler(admin.exportUsersCsv));
router.get("/users/:id", asyncHandler(admin.getUser));
router.patch("/users/:id", asyncHandler(admin.updateUser));
router.delete("/users/:id", asyncHandler(admin.deleteUser));
router.post("/users/:id/notify", asyncHandler(admin.notifyUser));
router.post("/broadcast", asyncHandler(admin.broadcast));
router.get("/projects", asyncHandler(admin.listProjects));
router.get("/matches", asyncHandler(admin.listMatches));
router.get("/hires", asyncHandler(admin.listHires));
router.get("/reviews", asyncHandler(admin.listReviews));
router.delete("/reviews/:id", asyncHandler(admin.deleteReview));
router.get("/finance", asyncHandler(admin.finance));
router.get("/settings", asyncHandler(admin.getSettings));
router.put("/settings", asyncHandler(admin.saveSettings));
router.get("/logs", asyncHandler(admin.logs));
router.get("/system", admin.system);

export default router;
