/**
 * Foto de perfil (cliente, arquiteto e loja).
 *
 * A foto chega do navegador já reduzida (≈ 320 px, WebP/JPEG — ver
 * MatchAvatar.prepare em assets/js/api.js) como data URI e fica no próprio
 * documento do usuário: funciona em qualquer hospedagem, inclusive no disco
 * temporário do Render, sem serviço de arquivos à parte.
 *
 * Ela nunca viaja dentro das listas (arquitetos, conversas, favoritos...):
 * as respostas levam só o caminho /api/avatars/:id?v=<versão>, servido por
 * routes/avatars.js com cache no navegador. A versão muda a cada troca de
 * foto, então a imagem nova aparece na hora em todo lugar.
 */
export const AVATAR_MAX_BYTES = 180 * 1024;
const DATA_URI = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Valida uma foto enviada. Retorna { value } (data URI ou "" para remover) ou { error }. */
export function parseAvatar(input) {
  if (input === null || input === "") return { value: "" };
  if (typeof input !== "string") return { error: "Foto inválida." };
  const m = DATA_URI.exec(input.trim());
  if (!m) return { error: "Envie a foto em PNG, JPG ou WebP." };
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > AVATAR_MAX_BYTES) return { error: "Foto grande demais. Escolha outra imagem." };
  return { value: input.trim() };
}

/** Decodifica o data URI guardado para servir como imagem. */
export function decodeAvatar(dataUri) {
  const m = DATA_URI.exec(String(dataUri || ""));
  if (!m) return null;
  return { type: `image/${m[1]}`, buffer: Buffer.from(m[2], "base64") };
}

/** Caminho público da foto (ou null quando a pessoa não tem foto). */
export function avatarPath(doc) {
  if (!doc) return null;
  const id = doc._id || doc.id;
  return id && doc.avatarVersion ? `/api/avatars/${id}?v=${doc.avatarVersion}` : null;
}
