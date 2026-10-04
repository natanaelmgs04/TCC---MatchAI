import crypto from "node:crypto";
import User from "../models/User.js";
import { DEMO_ARCHITECTS } from "../data/demoArchitects.js";
import { deleteUserCascade } from "./accountDeletion.js";

/**
 * Perfis ilustrativos de arquitetos para a fase inicial da plataforma.
 * - isDemo: true → o site mostra o selo "Perfil ilustrativo" e não deixa
 *   mandar mensagem, pedir contratação nem avaliar (não há ninguém do outro lado);
 * - senha aleatória que ninguém conhece → ninguém entra nessas contas;
 * - removíveis de uma vez, com tudo o que estiver ligado a elas.
 */
export async function countDemoArchitects() {
  return User.countDocuments({ isDemo: true });
}

export async function createDemoArchitects() {
  let created = 0;
  let skipped = 0;
  for (const data of DEMO_ARCHITECTS) {
    if (await User.exists({ email: data.email })) {
      skipped++;
      continue;
    }
    await new User({
      name: data.name,
      email: data.email,
      city: data.city,
      state: data.state,
      role: "architect",
      isDemo: true,
      passwordHash: crypto.randomBytes(24).toString("base64url"),
      architectProfile: data.architectProfile,
    }).save();
    created++;
  }
  return { created, skipped, total: await countDemoArchitects() };
}

export async function removeDemoArchitects() {
  const users = await User.find({ isDemo: true }).select("_id");
  for (const u of users) await deleteUserCascade(u._id);
  return { removed: users.length };
}

/** Resposta padrão quando alguém tenta interagir com um perfil ilustrativo. */
export { DEMO_BLOCK_MESSAGE } from "./hireRules.js";
