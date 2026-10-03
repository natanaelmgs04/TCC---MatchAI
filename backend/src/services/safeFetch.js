import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";

/**
 * GET de uma URL informada por um usuário (o site da loja parceira) sem abrir
 * brecha para o servidor acessar a rede interna (SSRF): só http/https, porta
 * padrão, e o IP é conferido no momento da conexão (lookup próprio), então um
 * DNS que muda de resposta no meio do caminho também é barrado. Redirecionamento
 * é seguido à mão (cada salto passa pela mesma checagem), com tempo e tamanho
 * máximos.
 */
const DEFAULTS = { timeoutMs: 15000, maxBytes: 8 * 1024 * 1024, maxRedirects: 4 };
const USER_AGENT = "match.IA catalog importer (+https://matchia.onrender.com)";

export class FetchError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    const safe = list.filter((a) => !isPrivateIp(a.address));
    if (!safe.length) return callback(new FetchError("Endereço não permitido."));
    if (options.all) return callback(null, safe);
    callback(null, safe[0].address, safe[0].family);
  });
}

export function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("Endereço inválido.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new FetchError("Use um endereço que comece com https://");
  if (url.username || url.password) throw new FetchError("Endereço inválido.");
  if (url.port && !["80", "443"].includes(url.port)) throw new FetchError("Endereço não permitido.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) ? isPrivateIp(host) : !host.includes(".") || /\.(local|internal|localhost)$/i.test(host)) {
    throw new FetchError("Endereço não permitido.");
  }
  return url;
}

function requestOnce(url, { timeoutMs, maxBytes, accept }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.get(
      url,
      {
        lookup: guardedLookup,
        timeout: timeoutMs,
        headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Encoding": "gzip, deflate, br" },
      },
      (res) => {
        const { statusCode = 0, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          return resolve({ redirect: new URL(headers.location, url).toString() });
        }
        const enc = String(headers["content-encoding"] || "").toLowerCase();
        const stream =
          enc === "gzip" ? res.pipe(zlib.createGunzip()) :
          enc === "deflate" ? res.pipe(zlib.createInflate()) :
          enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks = [];
        let size = 0;
        stream.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            reject(new FetchError("A resposta do site é grande demais."));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () =>
          resolve({ status: statusCode, contentType: String(headers["content-type"] || ""), body: Buffer.concat(chunks).toString("utf8") }),
        );
        stream.on("error", (e) => reject(new FetchError(e.message)));
      },
    );
    req.on("timeout", () => req.destroy(new FetchError("O site demorou demais para responder.")));
    req.on("error", (e) => reject(e instanceof FetchError ? e : new FetchError(e.code === "ENOTFOUND" ? "Não encontrei esse site." : "Não consegui acessar o site.")));
  });
}

/** Retorna { status, contentType, body, url } — nunca lança por status HTTP. */
export async function safeGet(raw, opts = {}) {
  const options = { ...DEFAULTS, accept: "*/*", ...opts };
  let current = raw;
  for (let hop = 0; hop <= options.maxRedirects; hop++) {
    const url = assertPublicUrl(current);
    const res = await requestOnce(url, options);
    if (!res.redirect) return { ...res, url: url.toString() };
    current = res.redirect;
  }
  throw new FetchError("Redirecionamentos demais.");
}

export async function safeGetJson(raw, opts = {}) {
  const res = await safeGet(raw, { accept: "application/json", ...opts });
  if (res.status !== 200) return null;
  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

export const __test = { isPrivateIp };
