import mongoose from "mongoose";
import ProjectFile from "../models/ProjectFile.js";

/**
 * Conteúdo dos arquivos técnicos no próprio MongoDB (GridFS, bucket
 * "projectfiles") — mesmo esquema do Estúdio 3D (model3dStore.js).
 */
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "projectfiles" });

export function saveBuffer(buffer, { filename, owner, project }) {
  return new Promise((resolve, reject) => {
    const up = bucket().openUploadStream(filename, { metadata: { owner: String(owner), project: String(project) } });
    up.once("error", reject);
    up.once("finish", () => resolve(up.id));
    up.end(buffer);
  });
}

export const openBuffer = (id) => bucket().openDownloadStream(new mongoose.Types.ObjectId(String(id)));

export async function deleteProjectFile(doc) {
  await bucket().delete(new mongoose.Types.ObjectId(String(doc.file))).catch(() => {});
  await ProjectFile.deleteOne({ _id: doc._id });
}

/** Apaga todos os arquivos de um ou mais projetos (exclusão de projeto/conta). */
export async function deleteFilesOfProjects(projectIds) {
  if (!projectIds.length) return;
  for (const f of await ProjectFile.find({ project: { $in: projectIds } }).select("_id file")) await deleteProjectFile(f);
}

/** Tipos aceitos: extensão → tipo servido. Sempre baixados como anexo (nunca abertos como página). */
export const FILE_TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  dwg: "application/octet-stream",
  dxf: "application/octet-stream",
  skp: "application/octet-stream",
  ifc: "application/octet-stream",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Assinatura dos formatos que o navegador mostra em prévia: o conteúdo tem que bater com a extensão.
const MAGIC = {
  pdf: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};

/** Valida nome/extensão/conteúdo. Devolve { error } ou { name, ext, mime }. */
export function checkUpload(rawName, buffer) {
  const name = String(rawName || "").replace(/[\/:*?"<>|\u0000-\u001f]/g, "").trim().slice(0, 120);
  const ext = (name.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "").toLowerCase();
  if (!name || !ext) return { error: "Arquivo sem nome ou sem extensão." };
  if (!FILE_TYPES[ext]) return { error: "Formato não aceito. Envie PDF, imagem (PNG/JPG/WebP), DWG, DXF, SKP, IFC, planilha (XLSX/XLS/CSV) ou DOCX." };
  if (!buffer?.length) return { error: "Arquivo vazio." };
  if (MAGIC[ext] && !MAGIC[ext](buffer)) return { error: `O conteúdo não parece um arquivo .${ext} de verdade.` };
  return { name, ext, mime: FILE_TYPES[ext] };
}
