import mongoose from "mongoose";
import Model3D from "../models/Model3D.js";
import { PROVIDERS, fetchResult } from "./model3dProviders.js";
import { notify } from "./notificationService.js";

/**
 * Arquivos do Estúdio 3D no próprio MongoDB (GridFS, bucket "models3d") e o
 * processador que acompanha as gerações em andamento.
 *
 * Os links dos provedores expiram em minutos (Tripo: 5), então quem baixa o
 * resultado é o servidor, assim que a tarefa termina — não o navegador. O
 * processador roda a cada poucos segundos enquanto houver tarefa aberta.
 */
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "models3d" });

export function saveFile(buffer, { filename, contentType, owner }) {
  return new Promise((resolve, reject) => {
    const up = bucket().openUploadStream(filename, { metadata: { owner: String(owner), contentType } });
    up.once("error", reject);
    up.once("finish", () => resolve(up.id));
    up.end(buffer);
  });
}

export function openFile(id) {
  return bucket().openDownloadStream(new mongoose.Types.ObjectId(String(id)));
}

export async function deleteFile(id) {
  if (!id) return;
  await bucket().delete(new mongoose.Types.ObjectId(String(id))).catch(() => {});
}

/** Remove um modelo e os arquivos dele. */
export async function deleteModel(model) {
  await Promise.all([deleteFile(model.file), deleteFile(model.preview)]);
  await Model3D.deleteOne({ _id: model._id });
}

const POLL_EVERY_MS = 4000;
const GIVE_UP_MS = 25 * 60 * 1000;

export async function finish(model, result) {
  const glb = await fetchResult(result);
  const file = await saveFile(glb, { filename: `${model._id}.glb`, contentType: "model/gltf-binary", owner: model.owner });
  let preview;
  if (result.previewUrl) {
    try {
      const img = await fetchResult({ modelUrl: result.previewUrl }, 5 * 1024 * 1024);
      preview = await saveFile(img, { filename: `${model._id}.png`, contentType: "image/png", owner: model.owner });
    } catch {
      /* prévia é opcional */
    }
  }
  await Model3D.updateOne(
    { _id: model._id },
    { $set: { status: "success", progress: 100, file, fileSize: glb.length, preview, completedAt: new Date() }, $unset: { error: "" } },
  );
  notify(model.owner, "system", `Seu modelo 3D "${model.title}" ficou pronto`, `modelo-3d.html?id=${model._id}`);
}

export async function fail(model, error) {
  await Model3D.updateOne({ _id: model._id }, { $set: { status: "failed", error: String(error || "Não foi possível gerar o modelo.").slice(0, 300) } });
  notify(model.owner, "system", `Não deu para gerar o modelo 3D "${model.title}"`, `modelo-3d.html?id=${model._id}`);
}

/** Uma rodada: consulta as tarefas abertas e baixa o que terminou. */
export async function pollOnce() {
  const now = Date.now();
  const open = await Model3D.find({
    status: { $in: ["queued", "running"] },
    $or: [{ lastPolledAt: { $exists: false } }, { lastPolledAt: { $lt: new Date(now - POLL_EVERY_MS) } }],
  }).limit(8);
  for (const model of open) {
    if (now - model.createdAt.getTime() > GIVE_UP_MS) {
      await fail(model, "A geração demorou demais e foi cancelada.");
      continue;
    }
    if (!model.providerTaskId) continue;
    await Model3D.updateOne({ _id: model._id }, { $set: { lastPolledAt: new Date() } });
    try {
      const r = await PROVIDERS[model.provider].poll(model.providerTaskId);
      if (r.status === "success") await finish(model, r);
      else if (r.status === "failed") await fail(model, r.error);
      else {
        const progress = r.progress ?? Math.min(95, Math.round(((now - model.createdAt.getTime()) / 150_000) * 95));
        await Model3D.updateOne({ _id: model._id }, { $set: { status: "running", progress: Math.max(model.progress || 0, progress) } });
      }
    } catch (err) {
      // erro de rede passageiro: tenta de novo na próxima rodada (até o limite de tempo)
      console.warn(`Estúdio 3D: falha ao consultar ${model.provider} (${model._id}):`, err.message);
    }
  }
}

let timer = null;
let busy = false;
export function startModel3dWorker() {
  if (timer) return;
  timer = setInterval(async () => {
    if (busy || mongoose.connection.readyState !== 1) return;
    busy = true;
    try {
      await pollOnce();
    } catch (err) {
      console.warn("Estúdio 3D:", err.message);
    } finally {
      busy = false;
    }
  }, 2000);
  timer.unref?.();
}
