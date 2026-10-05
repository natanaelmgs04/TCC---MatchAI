import fs from "node:fs";
import path from "node:path";
import { backendRoot } from "../config/env.js";

const siteRoot = path.resolve(backendRoot, "..");

/**
 * Provedores do Estúdio 3D. Cada um expõe create() e poll() com a mesma forma:
 *   create(input)  → { taskId, done?: { modelUrl, previewUrl } }
 *   poll(taskId)   → { status: "running" | "success" | "failed", progress, modelUrl?, previewUrl?, error? }
 *
 * - Tripo (objeto por texto ou foto): API v3, tarefa assíncrona.
 *   https://developers.tripo3d.ai/en/docs/quick-start
 * - MeltFlex (planta baixa → GLB): responde na hora ou com 202 + taskId.
 *   https://www.meltflexai.com/api
 * - demo: sem chave e fora de produção, devolve um modelo de exemplo do
 *   próprio site depois de alguns segundos — para testar o fluxo inteiro.
 *
 * As chaves ficam só no servidor (TRIPO_API_KEY, MELTFLEX_API_KEY).
 */
const TRIPO = "https://openapi.tripo3d.ai/v3";
const MELTFLEX = "https://www.meltflexai.com/api/v1/floorplan-to-3d";
const isProduction = process.env.NODE_ENV === "production";
const TIMEOUT = 60_000;

export class ProviderError extends Error {}

export function providerFor(kind) {
  if (kind === "object" && process.env.TRIPO_API_KEY) return "tripo";
  if (kind === "floorplan" && process.env.MELTFLEX_API_KEY) return "meltflex";
  if (!isProduction && process.env.MODEL3D_DEMO !== "0") return "demo";
  return null;
}

export function availability() {
  return {
    object: providerFor("object"),
    floorplan: providerFor("floorplan"),
  };
}

async function call(url, { method = "GET", headers = {}, body, timeout = TIMEOUT } = {}) {
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeout) });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* sem corpo JSON */
  }
  return { status: res.status, ok: res.ok, data };
}

// ------------------------------------------------------------------ Tripo
const tripoHeaders = () => ({ Authorization: `Bearer ${process.env.TRIPO_API_KEY}` });
const tripoModel = () => process.env.TRIPO_MODEL || "v3.1-20260211";

function tripoData(r, what) {
  if (!r.ok || (r.data && r.data.code !== undefined && r.data.code !== 0)) {
    const msg = r.data?.message || r.data?.error || `HTTP ${r.status}`;
    throw new ProviderError(`Tripo recusou ${what}: ${msg}`);
  }
  return r.data?.data ?? r.data;
}

async function tripoUpload({ buffer, mime }) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), `referencia.${mime.split("/")[1] || "jpg"}`);
  const r = await call(`${TRIPO}/files`, { method: "POST", headers: tripoHeaders(), body: form });
  const d = tripoData(r, "a imagem");
  const token = d?.file_token || d?.token || d?.image_token || d?.id;
  if (!token) throw new ProviderError("Tripo não devolveu o identificador da imagem.");
  return token;
}

const tripo = {
  async create({ source, prompt, image }) {
    const json = { "Content-Type": "application/json", ...tripoHeaders() };
    const common = { model: tripoModel(), texture: true, pbr: true };
    let r;
    if (source === "text") {
      r = await call(`${TRIPO}/generation/text-to-model`, { method: "POST", headers: json, body: JSON.stringify({ ...common, prompt }) });
    } else {
      const input = await tripoUpload(image);
      r = await call(`${TRIPO}/generation/image-to-model`, { method: "POST", headers: json, body: JSON.stringify({ ...common, input }) });
    }
    const d = tripoData(r, "o pedido");
    if (!d?.task_id) throw new ProviderError("Tripo não devolveu a tarefa.");
    return { taskId: d.task_id };
  },
  async poll(taskId) {
    const d = tripoData(await call(`${TRIPO}/tasks/${encodeURIComponent(taskId)}`, { headers: tripoHeaders() }), "a consulta");
    const s = String(d?.status || "").toLowerCase();
    if (s === "success") {
      return { status: "success", progress: 100, modelUrl: d.output?.model_url || d.output?.pbr_model || d.output?.model, previewUrl: d.output?.rendered_image_url };
    }
    if (["failed", "cancelled", "banned", "expired", "unknown"].includes(s)) {
      return { status: "failed", error: s === "banned" ? "O pedido foi recusado pela política de conteúdo da Tripo." : "A Tripo não conseguiu gerar este modelo." };
    }
    return { status: "running", progress: Math.max(0, Math.min(99, Number(d?.progress) || 0)) };
  },
};

// --------------------------------------------------------------- MeltFlex
const meltHeaders = () => ({ Authorization: `Bearer ${process.env.MELTFLEX_API_KEY}` });

function meltResult(r) {
  if (r.status === 202 || r.data?.status === "IN_PROGRESS") return { status: "running", taskId: r.data?.taskId };
  if (!r.ok || r.data?.success === false) {
    return { status: "failed", error: r.data?.error || r.data?.message || "A MeltFlex não conseguiu ler esta planta." };
  }
  if (r.data?.modelUrl) return { status: "success", progress: 100, modelUrl: r.data.modelUrl };
  return { status: "running" };
}

const meltflex = {
  async create({ image }) {
    const dataUrl = `data:${image.mime};base64,${image.buffer.toString("base64")}`;
    const r = await call(MELTFLEX, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...meltHeaders() },
      body: JSON.stringify({ image: dataUrl, output: "model", textured: true }),
      timeout: 120_000,
    });
    const res = meltResult(r);
    if (res.status === "failed") throw new ProviderError(res.error);
    if (res.status === "success") return { taskId: `done-${Date.now()}`, done: res };
    if (!res.taskId) throw new ProviderError("A MeltFlex não devolveu a tarefa.");
    return { taskId: res.taskId };
  },
  async poll(taskId) {
    const res = meltResult(await call(`${MELTFLEX}?taskId=${encodeURIComponent(taskId)}`, { headers: meltHeaders() }));
    // a MeltFlex não informa progresso: estimamos pelo tempo típico (~2–3 min)
    return res;
  },
};

// ------------------------------------------------------------------- demo
const DEMO_MODELS = {
  object: "assets/3d/models/props/mid_century_lounge_chair.glb",
  floorplan: "assets/3d/models/props/coffee_table_round_01.glb",
};
const DEMO_SECONDS = 10;
const demo = {
  async create({ kind }) {
    return { taskId: `demo:${kind}:${Date.now()}` };
  },
  async poll(taskId) {
    const [, kind, started] = taskId.split(":");
    const elapsed = (Date.now() - Number(started)) / 1000;
    if (elapsed < DEMO_SECONDS) return { status: "running", progress: Math.round((elapsed / DEMO_SECONDS) * 95) };
    return { status: "success", progress: 100, localFile: path.join(siteRoot, DEMO_MODELS[kind] || DEMO_MODELS.object) };
  },
};

export const PROVIDERS = { tripo, meltflex, demo };

/** Baixa o resultado (URL do provedor ou arquivo de exemplo) como Buffer, com teto de tamanho. */
export async function fetchResult({ modelUrl, localFile }, maxBytes = 50 * 1024 * 1024) {
  if (localFile) return fs.promises.readFile(localFile);
  const res = await fetch(modelUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new ProviderError(`Não consegui baixar o modelo (HTTP ${res.status}).`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new ProviderError("O modelo gerado é grande demais.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new ProviderError("O modelo gerado é grande demais.");
  return buf;
}
