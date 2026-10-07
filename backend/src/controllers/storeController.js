import StoreProduct from "../models/StoreProduct.js";
import StoreReferral from "../models/StoreReferral.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import { notify } from "../services/notificationService.js";
import { importCatalog, PLATFORM_LABELS } from "../services/catalogImporter.js";

export async function listMyProducts(req, res) {
  const products = await StoreProduct.find({ store: req.user.id }).sort("-createdAt");
  res.json(products);
}

export async function createProduct(req, res) {
  if (!req.body.name?.trim()) return res.status(400).json({ error: "Nome do produto é obrigatório." });
  const product = await StoreProduct.create({
    store: req.user.id,
    name: req.body.name.trim(),
    photo: req.body.photo,
    category: req.body.category,
    styles: Array.isArray(req.body.styles) ? req.body.styles : [],
    price: req.body.price ? Number(req.body.price) : undefined,
    purchaseUrl: req.body.purchaseUrl,
  });
  res.status(201).json(product);
}

export async function updateProduct(req, res) {
  const product = await StoreProduct.findOne({ _id: req.params.id, store: req.user.id });
  if (!product) return res.status(404).json({ error: "Produto não encontrado." });
  const allowed = ["name", "photo", "category", "purchaseUrl"];
  for (const key of allowed) if (req.body[key] !== undefined) product[key] = req.body[key];
  if (req.body.styles !== undefined) product.styles = Array.isArray(req.body.styles) ? req.body.styles : [];
  if (req.body.price !== undefined) product.price = req.body.price ? Number(req.body.price) : undefined;
  await product.save();
  res.json(product);
}

export async function deleteProduct(req, res) {
  const product = await StoreProduct.findOneAndDelete({ _id: req.params.id, store: req.user.id });
  if (!product) return res.status(404).json({ error: "Produto não encontrado." });
  res.json({ ok: true });
}

// Uma importação por loja por vez, com um intervalo mínimo entre elas — cada
// importação pode fazer dezenas de requisições ao site da loja.
const importing = new Map();
const IMPORT_COOLDOWN_MS = 60 * 1000;
const FAILED_COOLDOWN_MS = 10 * 1000;

export async function getCatalogStatus(req, res) {
  const store = await User.findById(req.user.id).select("storeProfile");
  const p = store?.storeProfile || {};
  const [imported, manual] = await Promise.all([
    StoreProduct.countDocuments({ store: req.user.id, source: "import" }),
    StoreProduct.countDocuments({ store: req.user.id, source: { $ne: "import" } }),
  ]);
  res.json({
    catalogUrl: p.catalogUrl || null,
    platform: p.catalogPlatform || null,
    platformLabel: p.catalogLabel || PLATFORM_LABELS[p.catalogPlatform] || null,
    syncedAt: p.catalogSyncedAt || null,
    imported,
    manual,
  });
}

/**
 * Importa (ou sincroniza de novo) o catálogo do site da loja. Produtos já
 * importados antes são atualizados pelo `externalId`; os que sumiram do site
 * saem daqui também. Produtos cadastrados à mão nunca são tocados, e estilos
 * que a loja ajustou à mão num produto importado são mantidos.
 */
export async function importProducts(req, res) {
  const storeId = String(req.user.id);
  const url = String(req.body?.url || "").trim();
  if (!url) return res.status(400).json({ error: "Cole o endereço do site da sua loja." });
  if (url.length > 500) return res.status(400).json({ error: "Endereço longo demais." });

  const last = importing.get(storeId);
  if (last === "running") return res.status(429).json({ error: "Já existe uma importação em andamento. Aguarde terminar." });
  if (last && Date.now() < last) {
    return res.status(429).json({ error: `Aguarde ${Math.ceil((last - Date.now()) / 1000)} segundos antes de importar de novo.` });
  }

  importing.set(storeId, "running");
  let cooldown = FAILED_COOLDOWN_MS;
  try {
    let result;
    try {
      result = await importCatalog(url);
    } catch (err) {
      return res.status(err.status === 422 ? 422 : 400).json({ error: err.message || "Não foi possível importar agora." });
    }
    cooldown = IMPORT_COOLDOWN_MS;

    const { products, platform, platformLabel, origin, sourceUrl } = result;
    const ops = products.map((p) => ({
      updateOne: {
        filter: { store: req.user.id, externalId: p.externalId },
        update: {
          $set: {
            name: p.name,
            photo: p.photo,
            category: p.category,
            price: p.price,
            purchaseUrl: p.purchaseUrl,
            tags: p.tags,
            source: "import",
          },
          $setOnInsert: { store: req.user.id, externalId: p.externalId, styles: p.styles },
        },
        upsert: true,
      },
    }));
    const write = await StoreProduct.bulkWrite(ops, { ordered: false });
    const removed = await StoreProduct.deleteMany({
      store: req.user.id,
      source: "import",
      externalId: { $nin: products.map((p) => p.externalId) },
    });

    await User.updateOne(
      { _id: req.user.id },
      {
        $set: {
          "storeProfile.catalogUrl": sourceUrl,
          "storeProfile.catalogPlatform": platform,
          "storeProfile.catalogLabel": platformLabel,
          "storeProfile.catalogSyncedAt": new Date(),
          "storeProfile.catalogCount": products.length,
        },
      },
    );

    res.json({
      platform,
      platformLabel,
      origin,
      catalogUrl: sourceUrl,
      total: products.length,
      created: write.upsertedCount || 0,
      updated: write.modifiedCount || 0,
      removed: removed.deletedCount || 0,
      sample: products.slice(0, 6).map(({ name, photo, price, category }) => ({ name, photo, price, category })),
    });
  } finally {
    importing.set(storeId, Date.now() + cooldown);
  }
}

/** Remove só os produtos importados (os cadastrados à mão ficam). */
export async function clearImportedProducts(req, res) {
  const removed = await StoreProduct.deleteMany({ store: req.user.id, source: "import" });
  await User.updateOne(
    { _id: req.user.id },
    { $unset: { "storeProfile.catalogUrl": "", "storeProfile.catalogPlatform": "", "storeProfile.catalogLabel": "", "storeProfile.catalogSyncedAt": "", "storeProfile.catalogCount": "" } },
  );
  res.json({ removed: removed.deletedCount || 0 });
}

export async function getStoreProfile(req, res) {
  const store = await User.findOne({ _id: req.params.id, role: "store" });
  if (!store) return res.status(404).json({ error: "Loja não encontrada." });
  res.json({ id: store.id, name: store.name, profile: store.storeProfile });
}

/**
 * Confirmação explícita do cliente ("Simular compra") a partir da sugestão
 * de produto dentro do projeto -- nunca criada por rastreamento passivo.
 */
export async function createReferral(req, res) {
  const { productId, projectId } = req.body || {};
  const product = await StoreProduct.findById(productId);
  if (!product) return res.status(404).json({ error: "Produto não encontrado." });

  if (projectId) {
    const project = await Project.findOne({ _id: projectId, client: req.user.id });
    if (!project) return res.status(404).json({ error: "Projeto não encontrado." });
  }

  const commissionRate = 0.1;
  const simulatedAmount = Math.round((product.price || 0) * commissionRate);
  const shareContact = req.body?.shareContact === true; // consentimento explícito, marcado pelo próprio cliente
  const referral = await StoreReferral.create({
    store: product.store,
    product: product.id,
    client: req.user.id,
    project: projectId || undefined,
    commissionRate,
    simulatedAmount,
    shareContact,
    consentAt: shareContact ? new Date() : undefined,
  });

  const who = shareContact ? req.user.name : "Um cliente do match.IA";
  notify(product.store, "store", `${who} simulou a compra de "${product.name}" indicado pela plataforma`, "dashboard.html");
  res.status(201).json({ id: referral.id, purchaseUrl: product.purchaseUrl, simulatedAmount });
}

export async function listMyReferrals(req, res) {
  const referrals = await StoreReferral.find({ store: req.user.id })
    .populate("client", "name email")
    .populate("product", "name")
    .sort("-createdAt");
  res.json({
    total: referrals.reduce((sum, r) => sum + (r.simulatedAmount || 0), 0),
    count: referrals.length,
    referrals: referrals.map((r) => ({
      id: r.id,
      // sem consentimento (ou revogado), a loja não recebe nome nem e-mail
      clientName: r.shareContact ? r.client?.name : null,
      clientEmail: r.shareContact ? r.client?.email : null,
      shareContact: !!r.shareContact,
      productName: r.product?.name,
      simulatedAmount: r.simulatedAmount,
      createdAt: r.createdAt,
    })),
  });
}

/** Cliente: com quais lojas o contato dele foi compartilhado (LGPD — transparência). */
export async function myConsents(req, res) {
  const referrals = await StoreReferral.find({ client: req.user.id, shareContact: true })
    .populate("store", "name storeProfile.storeName")
    .populate("product", "name")
    .sort("-createdAt");
  res.json(referrals.map((r) => ({
    id: r.id,
    store: r.store?.storeProfile?.storeName || r.store?.name || "Loja parceira",
    product: r.product?.name || "Produto",
    consentAt: r.consentAt || r.createdAt,
  })));
}

/** Cliente revoga o compartilhamento do contato com todas as lojas (LGPD, art. 8º, § 5º). */
export async function revokeConsents(req, res) {
  const r = await StoreReferral.updateMany({ client: req.user.id, shareContact: true }, { $set: { shareContact: false, consentRevokedAt: new Date() } });
  res.json({ revoked: r.modifiedCount });
}
