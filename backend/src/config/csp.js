import crypto from "node:crypto";
import fs from "node:fs";

/**
 * Content-Security-Policy das páginas do site.
 *
 * O ponto principal é script-src: o navegador só executa scripts vindos do
 * próprio site, dos CDNs que o site usa e os <script> embutidos que estão no
 * HTML original (liberados um a um pelo hash do conteúdo, calculado aqui).
 * Assim, se algum texto digitado por um usuário (nome, bio, comentário)
 * chegar ao HTML sem escape, um <img onerror=...> ou <script> injetado não
 * roda — nem links "javascript:".
 *
 * 'wasm-unsafe-eval' e worker blob: são do decodificador Draco (modelos 3D).
 * img-src aceita https: porque fotos cadastradas no banco podem vir de fora.
 */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
const cache = new Map();

function inlineHashes(file) {
  // O navegador converte quebras de linha CRLF/CR em LF ao ler o HTML, antes de
  // calcular o hash — sem isto, script embutido em arquivo salvo no Windows não batia.
  const html = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  const hashes = [];
  for (const m of html.matchAll(INLINE_SCRIPT)) {
    if (!m[1].trim()) continue;
    hashes.push(`'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  }
  return hashes;
}

export function cspFor(file, { cacheResult }) {
  if (cacheResult && cache.has(file)) return cache.get(file);
  let hashes = [];
  try {
    hashes = inlineHashes(file);
  } catch {
    /* arquivo sumiu entre a listagem e a leitura — segue sem hashes */
  }
  const policy = [
    "default-src 'self'",
    `script-src 'self' https://unpkg.com https://cdn.jsdelivr.net 'wasm-unsafe-eval' ${hashes.join(" ")}`.trim(),
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
    // cdn.jsdelivr.net: fontes-padrão que o pdf.js usa para desenhar textos de PDF (Espaço do projeto → Ver e comentar)
    "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    // blob:/data: — o GLTFLoader lê as texturas embutidas no .glb por blob: (Experiência 3D, Estúdio 3D)
    "connect-src 'self' blob: data: https://unpkg.com https://cdn.jsdelivr.net https://prod.spline.design https://*.spline.design",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  if (cacheResult) cache.set(file, policy);
  return policy;
}
