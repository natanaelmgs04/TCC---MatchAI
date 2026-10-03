import { safeGet, safeGetJson, assertPublicUrl, FetchError } from "./safeFetch.js";

/**
 * Importa o catálogo de uma loja parceira a partir do endereço do site dela —
 * a própria loja cola o link no painel (é o catálogo dela, publicado por ela).
 * Tenta, em ordem, as fontes públicas que as plataformas já oferecem:
 *
 *   1. Feed XML de produtos (Google Shopping / Facebook), se o link colado for um;
 *   2. Shopify            → /products.json
 *   3. WooCommerce        → /wp-json/wc/store/v1/products (Store API, pública)
 *   4. VTEX               → /api/catalog_system/pub/products/search
 *   5. Nuvemshop e outras → /google_shopping.xml
 *   6. Qualquer site      → dados estruturados schema.org/Product (JSON-LD) da
 *                           página colada e das páginas de produto do sitemap.
 *
 * Devolve produtos já normalizados para o formato de StoreProduct.
 */
export const MAX_PRODUCTS = 1000;
const MAX_CRAWL_PAGES = 80;
const CRAWL_CONCURRENCY = 4;

export const PLATFORM_LABELS = {
  feed: "Feed de produtos (XML)",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  vtex: "VTEX",
  jsonld: "Páginas de produto do site",
};

// ---------------------------------------------------------------- texto
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}
function cleanText(s, max = 200) {
  return decodeEntities(String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function httpUrl(raw, base) {
  if (!raw) return undefined;
  try {
    const u = new URL(String(raw).trim(), base);
    if (!["http:", "https:"].includes(u.protocol)) return undefined;
    const s = u.toString();
    return s.length <= 2000 ? s : undefined;
  } catch {
    return undefined;
  }
}
export function parsePrice(raw) {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) / 100 : undefined;
  const m = String(raw).match(/\d[\d.,]*/);
  if (!m) return undefined;
  let n = m[0];
  const lastDot = n.lastIndexOf(".");
  const lastComma = n.lastIndexOf(",");
  if (lastComma > lastDot) n = n.replace(/\./g, "").replace(",", ".");            // 1.299,90
  else if (lastDot > lastComma && lastComma >= 0) n = n.replace(/,/g, "");         // 1,299.90
  else if (lastComma < 0 && (n.match(/\./g) || []).length > 1) n = n.replace(/\./g, ""); // 1.299.000
  const value = Number.parseFloat(n);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : undefined;
}

// ------------------------------------------------- estilos e materiais
// Mesmo vocabulário de PROJECT_STYLES (assets/js/dashboard.js) — é o que o
// match de produtos (storeMatchService) compara com o projeto do cliente.
const STYLE_HINTS = [
  ["Industrial", ["industrial", "metalon", "tubular", "loft", "ferro"]],
  ["Rústico", ["rústic", "rustic", "demolição", "madeira maciça", "maciço", "palha", "junco"]],
  ["Escandinavo", ["escandinav", "nórdic", "nordic", "scandi", "pinus"]],
  ["Minimalista", ["minimalista", "minimal", "clean"]],
  ["Clássico", ["clássic", "classic", "provençal", "capitonê", "colonial", "luís xv", "barroco"]],
  ["Moderno", ["moderno", "moderna", "modern"]],
  ["Contemporâneo", ["contemporâne", "contemporary"]],
  ["Biofílico", ["planta", "vaso", "jardim", "bambu", "rattan", "fibra natural", "cachepô", "botânic"]],
  ["Brutalista", ["concreto", "cimento queimado", "brutalista"]],
  ["Alto padrão", ["mármore", "marmore", "travertino", "latão", "premium", "luxo", "assinado"]],
];
const MATERIAL_HINTS = [
  ["Madeira", ["madeira", "carvalho", "freijó", "nogueira", "pinus", "teca", "jequitibá", "eucalipto"]],
  ["Mármore", ["mármore", "marmore"]],
  ["Granito", ["granito"]],
  ["Travertino", ["travertino"]],
  ["Porcelanato", ["porcelanato"]],
  ["Cerâmica", ["cerâmic", "ceramic"]],
  ["Vidro", ["vidro", "cristal"]],
  ["Concreto", ["concreto", "cimento"]],
  ["Metal", ["aço", "ferro", "metal", "alumínio", "inox"]],
  ["Latão", ["latão", "dourado", "bronze"]],
  ["Couro", ["couro"]],
  ["Linho", ["linho"]],
  ["Veludo", ["veludo"]],
  ["Rattan", ["rattan", "palha", "vime", "junco", "fibra natural"]],
  ["Bambu", ["bambu"]],
  ["Pedra", ["pedra", "quartzo", "seixo"]],
  ["Tecido", ["tecido", "algodão", "bouclé", "boucle", "linho"]],
];
// Categoria quando a fonte não traz uma (comum em JSON-LD): pelo nome do produto.
const CATEGORY_HINTS = [
  ["Iluminação", ["lustre", "pendente", "luminária", "luminaria", "abajur", "arandela", "spot", "lâmpada", "plafon", "trilho", "fita led"]],
  ["Metais e louças", ["torneira", "cuba", "chuveiro", "misturador", "louça", "bacia", "ducha", "monocomando"]],
  ["Revestimentos", ["porcelanato", "revestimento", "azulejo", "pastilha", "piso", "rodapé", "papel de parede"]],
  ["Mobiliário", ["mesa", "cadeira", "sofá", "sofa", "poltrona", "banco", "banqueta", "rack", "estante", "cama", "aparador", "buffet", "cômoda", "recamier", "armário", "criado", "puff", "pufe", "painel"]],
  ["Têxtil", ["tapete", "cortina", "almofada", "manta", "colcha", "cobre-leito"]],
  ["Decoração", ["vaso", "quadro", "espelho", "escultura", "cachepô", "bandeja", "castiçal", "relógio", "objeto decorativo", "decorativ"]],
];
function inferCategory(name) {
  const t = String(name || "").toLowerCase();
  return CATEGORY_HINTS.find(([, words]) => words.some((w) => t.includes(w)))?.[0];
}

function inferTags(text) {
  const t = ` ${String(text || "").toLowerCase()} `;
  const pick = (list) => list.filter(([, words]) => words.some((w) => t.includes(w))).map(([name]) => name);
  return { styles: pick(STYLE_HINTS), materials: pick(MATERIAL_HINTS) };
}

function finalize(raw, base) {
  const name = cleanText(raw.name, 160);
  const purchaseUrl = httpUrl(raw.url, base);
  if (!name || !purchaseUrl) return null;
  const category = cleanText(raw.category, 80) || inferCategory(name);
  // Só etiquetas legíveis ("Sala de estar", "Carvalho"); descarta códigos internos
  // da plataforma ("allbirds::hue => pink", "OOS DNS", SKUs).
  const sourceTags = (raw.tags || [])
    .map((t) => cleanText(t, 40))
    .filter((t) => /^\p{L}[\p{L}\s&-]{1,30}$/u.test(t) && t !== t.toUpperCase())
    .slice(0, 12);
  const inferred = inferTags([name, category, ...sourceTags, cleanText(raw.description, 400)].join(" "));
  const tags = [...new Set([...inferred.materials, ...sourceTags])].slice(0, 16);
  return {
    externalId: String(raw.id || purchaseUrl).slice(0, 200),
    name,
    photo: httpUrl(raw.image, base),
    category,
    price: parsePrice(raw.price),
    purchaseUrl,
    tags,
    styles: inferred.styles,
  };
}

// ------------------------------------------------------------ Shopify
async function fromShopify(origin) {
  const first = await safeGetJson(`${origin}/products.json?limit=250&page=1`);
  if (!first || !Array.isArray(first.products)) return null;
  const out = [];
  let page = 1;
  let batch = first.products;
  while (batch.length && out.length < MAX_PRODUCTS) {
    for (const p of batch) {
      const tags = Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(",");
      out.push({
        id: `shopify:${p.id}`,
        name: p.title,
        url: `${origin}/products/${p.handle}`,
        image: p.images?.[0]?.src,
        price: p.variants?.[0]?.price,
        category: p.product_type,
        tags: [...tags, p.vendor].filter(Boolean),
        description: p.body_html,
      });
    }
    if (batch.length < 250) break;
    page += 1;
    const next = await safeGetJson(`${origin}/products.json?limit=250&page=${page}`);
    batch = Array.isArray(next?.products) ? next.products : [];
  }
  return out;
}

// -------------------------------------------------------- WooCommerce
async function fromWooCommerce(bases) {
  // WordPress pode estar numa subpasta (loja.com.br/loja): tenta as duas bases.
  const paths = bases.flatMap((base) => [
    (page) => `${base}/wp-json/wc/store/v1/products?per_page=100&page=${page}`,
    (page) => `${base}/?rest_route=/wc/store/v1/products&per_page=100&page=${page}`,
  ]);
  for (const build of paths) {
    const first = await safeGetJson(build(1));
    if (!Array.isArray(first) || (first.length && !first[0]?.permalink)) continue;
    const out = [];
    let page = 1;
    let batch = first;
    while (batch.length && out.length < MAX_PRODUCTS) {
      for (const p of batch) {
        const minor = Number(p.prices?.currency_minor_unit ?? 2);
        const cents = Number(p.prices?.price);
        out.push({
          id: `woo:${p.id}`,
          name: p.name,
          url: p.permalink,
          image: p.images?.[0]?.src,
          price: Number.isFinite(cents) && cents > 0 ? cents / 10 ** minor : undefined,
          category: p.categories?.[0]?.name,
          tags: (p.tags || []).map((t) => t.name),
          description: p.short_description || p.description,
        });
      }
      if (batch.length < 100) break;
      page += 1;
      const next = await safeGetJson(build(page));
      batch = Array.isArray(next) ? next : [];
    }
    return out;
  }
  return null;
}

// --------------------------------------------------------------- VTEX
async function fromVtex(origin) {
  const page = (from) => `${origin}/api/catalog_system/pub/products/search?_from=${from}&_to=${from + 49}`;
  const first = await safeGetJson(page(0));
  if (!Array.isArray(first) || (first.length && !first[0]?.productId)) return null;
  const out = [];
  let from = 0;
  let batch = first;
  // A busca pública da VTEX não pagina além de ~2.500 itens.
  while (batch.length && out.length < MAX_PRODUCTS && from < 2500) {
    for (const p of batch) {
      const item = p.items?.[0];
      const cats = String(p.categories?.[0] || "").split("/").filter(Boolean);
      out.push({
        id: `vtex:${p.productId}`,
        name: p.productName,
        url: p.link,
        image: item?.images?.[0]?.imageUrl,
        price: item?.sellers?.[0]?.commertialOffer?.Price,
        category: cats[cats.length - 1],
        tags: [p.brand, ...cats].filter(Boolean),
        description: p.description,
      });
    }
    if (batch.length < 50) break;
    from += 50;
    batch = (await safeGetJson(page(from))) || [];
    if (!Array.isArray(batch)) break;
  }
  return out;
}

// --------------------------------------------------- feed XML (Google)
function xmlTag(block, names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
    const m = block.match(re);
    if (m) return cleanText(m[1], 2000);
  }
  return "";
}
function looksLikeFeed(body) {
  return /<(rss|feed)[\s>]/i.test(body.slice(0, 3000)) && /<(item|entry)[\s>]/i.test(body);
}
export function parseFeed(body, base) {
  const blocks = body.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  return blocks.slice(0, MAX_PRODUCTS).map((b) => {
    const atomLink = b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1];
    return {
      id: `feed:${xmlTag(b, ["g:id", "id"]) || xmlTag(b, ["g:link", "link"])}`,
      name: xmlTag(b, ["g:title", "title"]),
      url: xmlTag(b, ["g:link", "link"]) || atomLink,
      image: xmlTag(b, ["g:image_link", "image_link", "g:image"]),
      price: xmlTag(b, ["g:sale_price", "g:price", "price"]),
      category: (xmlTag(b, ["g:product_type", "g:google_product_category", "category"]).split(">").pop() || "").trim(),
      tags: [xmlTag(b, ["g:brand", "brand"])].filter(Boolean),
      description: xmlTag(b, ["g:description", "description", "summary"]),
    };
  });
}
async function fromFeedUrl(url) {
  const res = await safeGet(url, { accept: "application/xml,text/xml,*/*" });
  if (res.status !== 200 || !looksLikeFeed(res.body)) return null;
  return { products: parseFeed(res.body, res.url), base: res.url };
}

// ----------------------------------------- JSON-LD (schema.org/Product)
function* walkJsonLd(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* walkJsonLd(n);
    return;
  }
  const type = [].concat(node["@type"] || []).map(String);
  if (type.includes("Product") || type.includes("ProductGroup")) yield node;
  if (node["@graph"]) yield* walkJsonLd(node["@graph"]);
  if (node.itemListElement) yield* walkJsonLd(node.itemListElement);
  if (node.item) yield* walkJsonLd(node.item);
  if (node.mainEntity) yield* walkJsonLd(node.mainEntity);
}
export function productsFromHtml(html, pageUrl) {
  const out = [];
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const s of scripts) {
    let data;
    try {
      data = JSON.parse(s.replace(/^<script[^>]*>|<\/script>$/gi, "").trim());
    } catch {
      continue;
    }
    for (const p of walkJsonLd(data)) {
      const offer = [].concat(p.offers || [])[0] || {};
      const variant = [].concat(p.hasVariant || [])[0] || {};
      const vOffer = [].concat(variant.offers || [])[0] || {};
      const image = [].concat(p.image || variant.image || [])[0];
      out.push({
        id: p.sku || p.productID || p.url || offer.url || `${pageUrl}#${p.name}`,
        name: p.name,
        url: p.url || offer.url || pageUrl,
        image: typeof image === "object" ? image?.url || image?.contentUrl : image,
        price: offer.price ?? offer.lowPrice ?? vOffer.price,
        category: typeof p.category === "string" ? p.category.split(/[>/]/).pop() : p.category?.name,
        tags: [typeof p.brand === "string" ? p.brand : p.brand?.name, p.material].filter((x) => typeof x === "string"),
        description: p.description,
      });
    }
  }
  return out;
}
function locs(xml) {
  return (xml.match(/<loc>([\s\S]*?)<\/loc>/gi) || []).map((l) => decodeEntities(l.replace(/<\/?loc>/gi, "").replace(/<!\[CDATA\[|\]\]>/g, "").trim()));
}
const PRODUCT_URL_RE = /\/(produtos?|products?|p|item|loja|shop)\/|\/p$|-p\d+|\/prod-/i;
async function productUrlsFromSitemap(origin) {
  const candidates = [];
  const robots = await safeGet(`${origin}/robots.txt`).catch(() => null);
  if (robots?.status === 200) {
    for (const m of robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)) candidates.push(m[1]);
  }
  candidates.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`);

  const urls = new Set();
  const seen = new Set();
  const queue = [...new Set(candidates)];
  while (queue.length && seen.size < 12 && urls.size < MAX_CRAWL_PAGES * 3) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const res = await safeGet(sm, { accept: "application/xml,text/xml,*/*" }).catch(() => null);
    if (!res || res.status !== 200) continue;
    if (/<sitemapindex/i.test(res.body)) {
      // Prioriza os sitemaps de produto (Shopify, Woo, Nuvemshop… nomeiam assim).
      const children = locs(res.body).sort((a, b) => Number(/produ/i.test(b)) - Number(/produ/i.test(a)));
      queue.unshift(...children.filter((c) => /produ/i.test(c)));
      queue.push(...children.filter((c) => !/produ/i.test(c)));
    } else {
      const all = locs(res.body).filter((u) => {
        try { return new URL(u).origin === origin; } catch { return false; }
      });
      const likely = /produ/i.test(sm) ? all : all.filter((u) => PRODUCT_URL_RE.test(new URL(u).pathname));
      likely.forEach((u) => urls.add(u));
    }
  }
  return [...urls].slice(0, MAX_CRAWL_PAGES);
}
async function fromJsonLd(start, origin) {
  const products = [];
  if (start?.status === 200) products.push(...productsFromHtml(start.body, start.url));

  const pages = await productUrlsFromSitemap(origin);
  let i = 0;
  const worker = async () => {
    while (i < pages.length && products.length < MAX_PRODUCTS) {
      const url = pages[i++];
      const res = await safeGet(url, { accept: "text/html,*/*", timeoutMs: 10000 }).catch(() => null);
      if (res?.status === 200) products.push(...productsFromHtml(res.body, res.url));
    }
  };
  await Promise.all(Array.from({ length: CRAWL_CONCURRENCY }, worker));
  return products;
}

// ------------------------------------------------------------- entrada
export async function importCatalog(rawUrl) {
  const input = String(rawUrl || "").trim();
  const url = assertPublicUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  const origin = url.origin;

  // Primeiro confirma que o site existe e responde — e reaproveita a página
  // para procurar dados de produto nela mesma.
  let start;
  try {
    start = await safeGet(url.toString(), { accept: "text/html,application/xml,*/*" });
  } catch (err) {
    // Página enorme (há lojas com HTML de dezenas de MB): o site existe, só não
    // dá para ler essa página — as outras fontes continuam valendo.
    if (!/grande demais/.test(err.message)) {
      throw new FetchError(
        /permitido|inválido|https/.test(err.message) ? err.message : "Não consegui acessar esse site. Confira o endereço e tente de novo.",
        422,
      );
    }
    start = null;
  }
  if (start?.status === 200 && looksLikeFeed(start.body)) {
    const products = parseFeed(start.body, start.url);
    if (products.length) return { ...pack("feed", origin, products), sourceUrl: url.toString() };
  }
  // Plataformas sem API pública caem nos dados estruturados; só o rótulo muda.
  const hint = start?.body ? platformHint(start.body) : null;

  const attempts = [];
  attempts.push(
    ["shopify", () => fromShopify(origin)],
    ["woocommerce", () => fromWooCommerce([...new Set([`${origin}${url.pathname.replace(/\/+$/, "")}`, origin])])],
    ["vtex", () => fromVtex(origin)],
    ["feed", async () => (await fromFeedUrl(`${origin}/google_shopping.xml`))?.products],
    ["jsonld", () => fromJsonLd(start, origin)],
  );

  for (const [platform, run] of attempts) {
    const raw = await run().catch(() => null);
    const result = raw?.length ? pack(platform, origin, raw) : null;
    if (result) {
      if (platform === "jsonld" && hint) result.platformLabel = hint;
      return { ...result, sourceUrl: url.toString() };
    }
  }

  throw new FetchError(
    "Não encontrei produtos nesse endereço. Se a sua loja tiver um feed XML de produtos (o mesmo do Google Shopping ou do catálogo do Facebook/Instagram), cole o link dele.",
    422,
  );
}

function platformHint(html) {
  const head = html.slice(0, 400000);
  if (/mitiendanube\.com|nuvemshop/i.test(head)) return "Nuvemshop";
  if (/lojaintegrada/i.test(head)) return "Loja Integrada";
  if (/tray\.com\.br|traycorp/i.test(head)) return "Tray";
  if (/magento|mage\/cookies/i.test(head)) return "Magento";
  if (/wixstatic\.com/i.test(head)) return "Wix";
  return null;
}

function pack(platform, origin, raw) {
  const seen = new Set();
  const products = [];
  for (const r of raw) {
    const p = finalize(r, origin);
    if (!p || seen.has(p.externalId)) continue;
    seen.add(p.externalId);
    products.push(p);
    if (products.length >= MAX_PRODUCTS) break;
  }
  return products.length ? { platform, platformLabel: PLATFORM_LABELS[platform], origin, products } : null;
}

export const __test = { finalize, inferTags, decodeEntities };
