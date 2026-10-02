import "../config/env.js"; // carrega backend/KEYS.env de qualquer pasta
import { connectDatabase } from "../config/database.js";
import User from "../models/User.js";
import { cauVerifiedEmail } from "../services/emailService.js";
import { notify } from "../services/notificationService.js";
import mongoose from "mongoose";

const email = process.argv[2];
if (!email) {
  console.error("Uso: node src/scripts/approveCau.js email@do-arquiteto.com");
  process.exit(1);
}

await connectDatabase();
const user = await User.findOne({ email: email.toLowerCase(), role: "architect" });
if (!user) {
  console.error("Nenhum arquiteto encontrado com esse e-mail.");
  await mongoose.disconnect();
  process.exit(1);
}

user.architectProfile.cauVerification.status = "verified";
await user.save();
await cauVerifiedEmail(user);
await notify(user.id, "cau", "Seu registro CAU/A foi verificado", "dashboard.html");
console.log(`${user.name} verificado com sucesso. E-mail de confirmação enviado (ou simulado, se sem SMTP configurado).`);
await mongoose.disconnect();
