import StoreProduct from "../models/StoreProduct.js";
import { extractProjectKeywords } from "./geminiService.js";

/**
 * Casa um projeto com o catálogo de produtos das lojas parceiras. A IA só
 * traduz o texto livre do projeto em palavras-chave (extractProjectKeywords)
 * — a busca em si é uma pontuação por sobreposição de termos contra o
 * catálogo já cadastrado pelas lojas, nunca uma busca ao vivo no site delas.
 */
export async function suggestProductsForProject(project) {
  const keywords = await extractProjectKeywords(project.projectGoals).catch(() => []);
  const terms = [
    ...(project.preferredStyles || []),
    ...(project.preferredMaterials || []),
    ...keywords,
  ].map((t) => String(t).toLowerCase());

  if (!terms.length) return [];

  const products = await StoreProduct.find()
    .select("name photo category styles tags price purchaseUrl store")
    .populate("store", "name storeProfile.storeName status");
  const scored = products
    .filter((product) => product.store && product.store.status !== "suspended")
    .map((product) => {
      const productTerms = [product.category, ...(product.styles || []), ...(product.tags || [])]
        .filter(Boolean)
        .map((t) => String(t).toLowerCase());
      const score = terms.reduce((sum, term) => sum + (productTerms.some((pt) => pt.includes(term) || term.includes(pt)) ? 1 : 0), 0);
      return { product, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.map(({ product, score }) => ({
    id: product.id,
    name: product.name,
    photo: product.photo,
    category: product.category,
    price: product.price,
    purchaseUrl: product.purchaseUrl,
    storeName: product.store?.storeProfile?.storeName || product.store?.name,
    storeId: product.store?.id,
    score,
  }));
}
