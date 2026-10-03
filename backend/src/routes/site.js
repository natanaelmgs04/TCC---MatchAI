import { Router } from "express";
import SiteSetting from "../models/SiteSetting.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

/** GET /api/site/config — o que o site público precisa saber (faixa de aviso). */
const router = Router();
let cache = { at: 0, body: null };
router.get("/config", asyncHandler(async (_req, res) => {
  if (!cache.body || Date.now() - cache.at > 30_000) {
    const doc = await SiteSetting.findOne({ key: "announcement" }).lean();
    const a = doc?.value || {};
    cache = {
      at: Date.now(),
      body: { announcement: a.active && a.text ? { text: a.text, link: a.link || "", tone: a.tone || "info", id: String(doc.updatedAt?.getTime?.() || "") } : null },
    };
  }
  res.setHeader("Cache-Control", "no-cache");
  res.json(cache.body);
}));
export const clearSiteConfigCache = () => { cache = { at: 0, body: null }; };

export default router;
