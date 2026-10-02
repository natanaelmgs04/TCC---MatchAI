import "../config/env.js"; // carrega backend/KEYS.env de qualquer pasta
import { connectDatabase } from "../config/database.js";
import User from "../models/User.js";
import MatchHistory from "../models/MatchHistory.js";
import mongoose from "mongoose";

const email = process.argv[2];
if (!email) {
  console.error("Uso: node src/scripts/cleanMatchHistory.js email@do-cliente.com");
  console.error("Apaga o histórico de matches (buscas) de um único cliente — use para");
  console.error("remover buscas de teste feitas com perfil incompleto, que distorcem a");
  console.error("média real exibida em GET /api/stats.");
  process.exit(1);
}

await connectDatabase();
const user = await User.findOne({ email: email.toLowerCase(), role: "client" });
if (!user) {
  console.error("Nenhum cliente encontrado com esse e-mail.");
  await mongoose.disconnect();
  process.exit(1);
}

const { deletedCount } = await MatchHistory.deleteMany({ client: user.id });
console.log(`${deletedCount} busca(s) de match removida(s) do histórico de ${user.name} (${user.email}).`);
await mongoose.disconnect();
