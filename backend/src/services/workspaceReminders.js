import mongoose from "mongoose";
import Project from "../models/Project.js";
import User from "../models/User.js";
import { notify } from "./notificationService.js";
import { workspaceEmail } from "./emailService.js";
import { dueReminders } from "./workspaceRules.js";

/**
 * Lembretes de prazo do Espaço do projeto: uma vez por hora procura etapas
 * em andamento (ou aguardando aprovação) que vencem em até 3 dias ou que já
 * atrasaram, e avisa no sininho e por e-mail. Cada lembrete sai uma vez por
 * prazo (remindedSoonAt/remindedLateAt na etapa).
 */
const fmt = (d) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export async function sendDueReminders(now = new Date()) {
  const soonLimit = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const projects = await Project.find({
    architect: { $exists: true },
    status: { $ne: "completed" },
    stages: { $elemMatch: { status: { $in: ["in_progress", "awaiting_approval"] }, dueDate: { $lte: soonLimit } } },
  }).select("name client architect stages");
  let sent = 0;
  for (const project of projects) {
    const due = dueReminders(project.stages, now);
    if (!due.length) continue;
    const people = await User.find({ _id: { $in: [project.client, project.architect] } }).select("name email role");
    const byRole = { client: people.find((u) => String(u._id) === String(project.client)), architect: people.find((u) => String(u._id) === String(project.architect)) };
    const link = `projeto.html?id=${project._id}`;
    for (const r of due) {
      const stage = project.stages.find((s) => s.key === r.key);
      for (const role of r.to) {
        const who = byRole[role];
        if (!who) continue;
        const text = r.kind === "late"
          ? `A etapa "${stage.name}" do projeto "${project.name}" passou do prazo (${fmt(stage.dueDate)}).`
          : role === "client"
            ? `A etapa "${stage.name}" do projeto "${project.name}" aguarda a sua aprovação — o prazo vence em ${r.days} ${r.days === 1 ? "dia" : "dias"} (${fmt(stage.dueDate)}).`
            : `O prazo da etapa "${stage.name}" do projeto "${project.name}" vence em ${r.days} ${r.days === 1 ? "dia" : "dias"} (${fmt(stage.dueDate)}).`;
        notify(who._id, "timeline", text, link);
        workspaceEmail(who, {
          subject: r.kind === "late" ? `Etapa atrasada: ${stage.name} — match.IA` : `Prazo chegando: ${stage.name} — match.IA`,
          lines: [text, r.kind === "late" ? "Combine um novo prazo no espaço do projeto para manter a meta de entrega." : "Abra o espaço do projeto para ver o que falta."],
          projectId: project._id,
        }).catch(() => {});
        sent += 1;
      }
      stage[r.kind === "late" ? "remindedLateAt" : "remindedSoonAt"] = now;
    }
    await project.save();
  }
  return sent;
}

let timer = null;
export function startWorkspaceReminders() {
  if (timer) return;
  const run = () => {
    if (mongoose.connection.readyState !== 1) return;
    sendDueReminders().catch((err) => console.warn("Lembretes de prazo:", err.message));
  };
  setTimeout(run, 60 * 1000).unref?.(); // primeira rodada logo depois de subir
  timer = setInterval(run, 60 * 60 * 1000);
  timer.unref?.();
}
