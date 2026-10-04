import "../config/env.js"; // carrega backend/KEYS.env de qualquer pasta
import { connectDatabase } from "../config/database.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { DEMO_ARCHITECTS } from "../data/demoArchitects.js";

// Mesmos perfis que o painel da equipe cria em produção (lá com isDemo e sem senha conhecida).
const architects = DEMO_ARCHITECTS;

await connectDatabase();

let created = 0;
let skipped = 0;
for (const data of architects) {
  const exists = await User.findOne({ email: data.email });
  if (exists) {
    skipped++;
    continue;
  }
  const user = new User({
    name: data.name,
    email: data.email,
    city: data.city,
    state: data.state,
    role: "architect",
    // Banco local: contas com senha conhecida para testar o fluxo inteiro
    // (entrar como arquiteto, aceitar contratação). Sem isDemo de propósito.
    passwordHash: "MatchIA@Demo2026",
    architectProfile: data.architectProfile,
  });
  await user.save();
  created++;
}

console.log(`${created} arquitetos fictícios criados, ${skipped} já existiam.`);
await mongoose.disconnect();
