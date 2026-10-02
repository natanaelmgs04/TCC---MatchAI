import "../config/env.js"; // carrega backend/KEYS.env de qualquer pasta
import { connectDatabase } from "../config/database.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Message from "../models/Message.js";
import Review from "../models/Review.js";
import MatchHistory from "../models/MatchHistory.js";
import Validation from "../models/Validation.js";
import Notification from "../models/Notification.js";
import Favorite from "../models/Favorite.js";
import mongoose from "mongoose";

const emails = process.argv.slice(2);
if (!emails.length) {
  console.error("Uso: node src/scripts/deleteAccounts.js email1@x.com email2@x.com ...");
  console.error("Apaga permanentemente uma ou mais contas e todos os dados ligados a elas");
  console.error("(projetos, mensagens, avaliações, histórico de match, validações e notificações).");
  process.exit(1);
}

await connectDatabase();

for (const email of emails) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.log(`Nenhuma conta encontrada com o e-mail ${email} — pulando.`);
    continue;
  }
  const userId = user.id;
  await Promise.all([
    Project.deleteMany({ client: userId }),
    Message.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
    Review.deleteMany({ $or: [{ client: userId }, { architect: userId }] }),
    MatchHistory.deleteMany({ client: userId }),
    Validation.deleteMany({ $or: [{ client: userId }, { architect: userId }] }),
    Notification.deleteMany({ user: userId }),
    Favorite.deleteMany({ $or: [{ client: userId }, { architect: userId }] }),
  ]);
  await user.deleteOne();
  console.log(`Conta removida: ${user.name} (${user.email}, ${user.role}).`);
}

await mongoose.disconnect();
