import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  listMyProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getStoreProfile,
  createReferral,
  listMyReferrals,
  getCatalogStatus,
  importProducts,
  clearImportedProducts,
  myConsents,
  revokeConsents,
} from "../controllers/storeController.js";

const router = Router();
router.get("/me/products", requireAuth, requireRole("store"), asyncHandler(listMyProducts));
router.post("/me/products", requireAuth, requireRole("store"), asyncHandler(createProduct));
router.patch("/me/products/:id", requireAuth, requireRole("store"), asyncHandler(updateProduct));
router.delete("/me/products/:id", requireAuth, requireRole("store"), asyncHandler(deleteProduct));
router.get("/me/catalog", requireAuth, requireRole("store"), asyncHandler(getCatalogStatus));
router.post("/me/catalog/import", requireAuth, requireRole("store"), asyncHandler(importProducts));
router.delete("/me/catalog", requireAuth, requireRole("store"), asyncHandler(clearImportedProducts));
router.get("/me/referrals", requireAuth, requireRole("store"), asyncHandler(listMyReferrals));
router.post("/referrals", requireAuth, requireRole("client"), asyncHandler(createReferral));
router.get("/consents", requireAuth, requireRole("client"), asyncHandler(myConsents));
router.post("/consents/revoke", requireAuth, requireRole("client"), asyncHandler(revokeConsents));
router.get("/:id", asyncHandler(getStoreProfile));

export default router;
