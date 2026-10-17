import mongoose from "mongoose";
import Project from "../models/Project.js";
import User from "../models/User.js";
import { notify } from "./notificationService.js";
import { workspaceEmail } from "./emailService.js";
import { dueReminders } from "./workspaceRules.js";
import { dueMaintenance, dueMeetingReminders } from "./officeRules.js";

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

const when = (d) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Agenda: lembrete 24 h antes, para os dois lados, uma vez por compromisso. */
export async function sendMeetingReminders(now = new Date()) {
  const limit = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const projects = await Project.find({ meetings: { $elemMatch: { startsAt: { $gt: now, $lte: limit }, remindedAt: { $exists: false }, cancelledAt: { $exists: false } } } }).select("name client architect meetings");
  let sent = 0;
  for (const project of projects) {
    const due = dueMeetingReminders(project.meetings, now);
    if (!due.length) continue;
    const people = await User.find({ _id: { $in: [project.client, project.architect] } }).select("name email");
    for (const m of due) {
      const text = `Lembrete: "${m.title}" do projeto "${project.name}" é ${when(m.startsAt)}${m.place ? ` — ${m.place}` : ""}.`;
      for (const who of people) {
        notify(who._id, "timeline", text, `projeto.html?id=${project._id}#agenda`);
        workspaceEmail(who, { subject: `Amanhã: ${m.title} — match.IA`, lines: [text, ...(m.note ? [`Recado: ${m.note}`] : [])], projectId: project._id, path: `projeto.html?id=${project._id}#agenda` }).catch(() => {});
        sent += 1;
      }
      m.remindedAt = now;
    }
    await project.save();
  }
  return sent;
}

/** Manual da casa: avisa o cliente quando chega a hora de cada manutenção (uma vez por ciclo). */
export async function sendMaintenanceReminders(now = new Date()) {
  const projects = await Project.find({ "maintenance.nextAt": { $lte: now } }).select("name client maintenance");
  let sent = 0;
  for (const project of projects) {
    const due = dueMaintenance(project.maintenance, now);
    if (!due.length) continue;
    const client = await User.findById(project.client).select("name email");
    if (!client) continue;
    const text = `Hora da manutenção na sua casa (projeto "${project.name}"): ${due.map((t) => t.task.toLowerCase()).join("; ")}.`;
    notify(client._id, "timeline", text, `projeto.html?id=${project._id}#obra`);
    workspaceEmail(client, { subject: "Manutenção da casa — match.IA", lines: [text, "Feito? Marque no manual da casa (aba Obra) e o próximo lembrete conta a partir dessa data."], projectId: project._id, path: `projeto.html?id=${project._id}#obra` }).catch(() => {});
    due.forEach((t) => { t.remindedAt = now; });
    sent += 1;
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
    sendMeetingReminders().catch((err) => console.warn("Lembretes da agenda:", err.message));
    sendMaintenanceReminders().catch((err) => console.warn("Lembretes de manutenção:", err.message));
  };
  setTimeout(run, 60 * 1000).unref?.(); // primeira rodada logo depois de subir
  timer = setInterval(run, 60 * 60 * 1000);
  timer.unref?.();
}
