import nodemailer from "nodemailer";
import { escapeHtml } from "./assistantService.js";

/*
 * Como o e-mail sai, em ordem de preferência:
 *  1. BREVO_API_KEY → API HTTP da Brevo (porta 443). É o caminho para o Render
 *     grátis, que bloqueia as portas de SMTP (25, 465 e 587) desde set/2025.
 *  2. EMAIL_HOST/EMAIL_USER/EMAIL_PASS → SMTP (ex.: Gmail com senha de app).
 *     Funciona rodando local ou em plano pago.
 *  3. Nada configurado → o e-mail só aparece no console; o site segue normal.
 */

// Endereço público do site para os links dos e-mails. Nunca vem do cabeçalho
// Host da requisição em produção: com ele, um atacante pedia "esqueci minha
// senha" para a vítima mandando Host: site-dele.com e o link de redefinição
// (com o token) apontava para o site dele.
export function publicBaseUrl(req) {
  const fixed = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (fixed) return fixed.replace(/\/+$/, "");
  return req ? `${req.protocol}://${req.get("host")}` : "";
}

// "match.IA <contato@exemplo.com>" ou só "contato@exemplo.com".
function parseFrom(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/^(.*)<([^>]+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, "") || "match.IA", email: m[2].trim() };
  return { name: "match.IA", email: raw };
}

function emailMode() {
  if (process.env.BREVO_API_KEY) return "brevo";
  const { EMAIL_HOST, EMAIL_USER, EMAIL_PASS } = process.env;
  if (EMAIL_HOST && EMAIL_USER && EMAIL_PASS) return "smtp";
  return null;
}

export function emailStatus() {
  const mode = emailMode();
  if (!mode) return "simulado (só no console)";
  const from = parseFrom(process.env.EMAIL_FROM || process.env.EMAIL_USER).email;
  if (!from) return `${mode}, mas falta EMAIL_FROM (remetente)`;
  return mode === "brevo" ? "Brevo (API HTTP)" : `SMTP ${process.env.EMAIL_HOST}`;
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT) || 587,
    secure: Number(EMAIL_PORT) === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    connectionTimeout: 10_000,
  });
  return transporter;
}

async function sendViaBrevo({ from, to, subject, html, text }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ sender: from, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message || ""; } catch {}
    throw new Error(`Brevo respondeu ${res.status}${detail ? `: ${detail}` : ""}`);
  }
}

const htmlToText = (html) =>
  html.replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

// Moldura simples com as cores da marca; clientes de e-mail só aceitam estilo inline.
function layout(body, cta) {
  const base = publicBaseUrl();
  const button = cta && base
    ? `<p style="margin:24px 0 8px"><a href="${base}/${cta.path}" style="background:#B0755A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;display:inline-block">${cta.label}</a></p>`
    : "";
  return `<div style="background:#FAF9F6;padding:24px 12px;font-family:Inter,Arial,sans-serif;color:#333333">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #EEE3DA;border-radius:16px;padding:28px">
<p style="font-family:Georgia,serif;font-size:22px;margin:0 0 18px;color:#333333">match<span style="color:#B0755A">.IA</span></p>
<div style="font-size:15px;line-height:1.6">${body}${button}</div>
</div>
<p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#7B8E7E;text-align:center">Você recebeu este e-mail por ter uma conta no match.IA.</p>
</div>`;
}

/**
 * Envia um e-mail transacional. Nunca derruba a requisição que o originou:
 * falha de envio só vai para o log.
 */
export async function sendEmail({ to, subject, html, cta }) {
  const mode = emailMode();
  const fullHtml = layout(html, cta);
  const text = htmlToText(html) + (cta && publicBaseUrl() ? ` ${cta.label}: ${publicBaseUrl()}/${cta.path}` : "");
  if (!mode) {
    // Sem o corpo aqui, um e-mail simulado com link (redefinição de senha,
    // por exemplo) era impossível de testar localmente — o link só existia
    // dentro do HTML, que nunca aparecia em lugar nenhum.
    console.log(`[email simulado] Para: ${to} | Assunto: ${subject}\n  ${text}`);
    return { simulated: true };
  }
  const from = parseFrom(process.env.EMAIL_FROM || process.env.EMAIL_USER);
  try {
    if (mode === "brevo") await sendViaBrevo({ from, to, subject, html: fullHtml, text });
    else await getTransporter().sendMail({ from: { name: from.name, address: from.email }, to, subject, html: fullHtml, text });
    return { simulated: false };
  } catch (err) {
    console.error(`Falha ao enviar e-mail (${mode}) para o assunto "${subject}":`, err.message);
    return { simulated: true, error: err.message };
  }
}

export function welcomeEmail(user) {
  return sendEmail({
    to: user.email,
    subject: "Bem-vindo(a) ao match.IA",
    html: `<p>Olá, ${escapeHtml(user.name)}!</p><p>Sua conta de ${{ architect: "arquiteto", store: "loja parceira", client: "cliente" }[user.role] || "cliente"} no match.IA foi criada com sucesso. ${{
      client: "Complete seu perfil e rode seu primeiro match com IA.",
      architect: "Complete seu portfólio para aparecer nos resultados de match.",
      store: "Cadastre ou importe seus produtos para eles aparecerem nas sugestões dos projetos.",
    }[user.role] || ""}</p>`,
    cta: { label: "Abrir meu painel", path: "dashboard.html" },
  });
}

export function cauVerifiedEmail(architect) {
  return sendEmail({
    to: architect.email,
    subject: "Seu registro CAU/A foi verificado no match.IA",
    html: `<p>Olá, ${escapeHtml(architect.name)}!</p><p>Seu registro profissional foi verificado pela equipe match.IA. O selo "✓ Verificado" já está ativo no seu perfil público, aumentando a confiança dos clientes que encontrarem você pelo match.</p>`,
    cta: { label: "Abrir meu painel", path: "dashboard.html" },
  });
}

export function validationClosedEmail(recipient, otherParty) {
  return sendEmail({
    to: recipient.email,
    subject: "Resumo do projeto confirmado por ambas as partes — match.IA",
    html: `<p>Olá, ${escapeHtml(recipient.name)}!</p><p>Você e ${escapeHtml(otherParty.name)} confirmaram o resumo do projeto no match.IA. Agora vocês têm um registro alinhado do que foi combinado — bom momento para avançar com os próximos passos pelo chat da plataforma.</p>`,
    cta: { label: "Abrir meu painel", path: "dashboard.html" },
  });
}

export function newReviewEmail(architect, clientName, rating, comment) {
  return sendEmail({
    to: architect.email,
    subject: `Você recebeu uma nova avaliação no match.IA`,
    html: `<p>Olá, ${escapeHtml(architect.name)}!</p><p>${escapeHtml(clientName)} avaliou seu atendimento com ${rating} de 5 estrelas${comment ? `:</p><blockquote>${escapeHtml(comment)}</blockquote>` : "."}<p>Veja no seu perfil público ou no painel.</p>`,
    cta: { label: "Abrir meu painel", path: "dashboard.html" },
  });
}

export function passwordResetEmail(user, resetUrl) {
  return sendEmail({
    to: user.email,
    subject: "Redefinir sua senha — match.IA",
    html: `<p>Olá, ${escapeHtml(user.name)}!</p><p>Pediram a redefinição da senha da sua conta match.IA. Se foi você, clique no link abaixo para escolher uma nova senha (válido por 1 hora):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.</p>`,
  });
}

export function newMessageEmail(recipient, senderName, text) {
  // O texto é digitado pelo remetente (ou gerado por IA a partir do que ele
  // escreveu): escapa antes de entrar no HTML do e-mail.
  const safeName = escapeHtml(senderName);
  return sendEmail({
    to: recipient.email,
    subject: `Nova mensagem de ${senderName} no match.IA`,
    html: `<p>${safeName} te enviou uma mensagem no match.IA:</p><blockquote style="white-space:pre-wrap">${escapeHtml(text)}</blockquote><p>Entre no seu painel para responder.</p>`,
    cta: { label: "Responder", path: "dashboard.html" },
  });
}

// ---- Contratação (ver controllers/hireController.js) ----
export function hireRequestEmail(architect, client, project) {
  return sendEmail({
    to: architect.email,
    subject: `${client.name} quer contratar você no match.IA`,
    html: `<p>Olá, ${escapeHtml(architect.name)}!</p><p>${escapeHtml(client.name)} pediu para contratar você para o projeto <strong>${escapeHtml(project.name)}</strong>. Na aba "Contratações" do seu painel você vê os detalhes e aceita ou recusa.</p>`,
    cta: { label: "Ver pedido", path: "dashboard.html#contratacoes" },
  });
}

export function hireDecisionEmail(client, architect, projectName, accepted, response) {
  if (!client) return Promise.resolve({ simulated: true });
  const reply = response ? `<blockquote style="white-space:pre-wrap">${escapeHtml(response)}</blockquote>` : "";
  return sendEmail({
    to: client.email,
    subject: accepted ? `${architect.name} aceitou seu projeto — match.IA` : `Resposta de ${architect.name} — match.IA`,
    html: accepted
      ? `<p>Olá, ${escapeHtml(client.name)}!</p><p>${escapeHtml(architect.name)} aceitou o projeto <strong>${escapeHtml(projectName)}</strong>. O projeto está fechado pela plataforma — combinem os próximos passos pelo chat do match.IA.</p>${reply}`
      : `<p>Olá, ${escapeHtml(client.name)}!</p><p>${escapeHtml(architect.name)} não pôde aceitar o projeto <strong>${escapeHtml(projectName)}</strong> agora.</p>${reply}<p>No seu painel você pode contratar outro arquiteto compatível.</p>`,
    cta: { label: "Abrir meu painel", path: "dashboard.html" },
  });
}

export function hireCancelledEmail(architect, client, projectName) {
  if (!architect) return Promise.resolve({ simulated: true });
  return sendEmail({
    to: architect.email,
    subject: `Pedido de contratação cancelado — match.IA`,
    html: `<p>Olá, ${escapeHtml(architect.name)}!</p><p>${escapeHtml(client.name)} cancelou o pedido de contratação do projeto <strong>${escapeHtml(projectName)}</strong>.</p>`,
  });
}

// ---- Espaço do projeto (ver controllers/workspaceController.js e services/workspaceReminders.js) ----
/** Aviso do Espaço do projeto: `lines` já vem em texto puro (é escapado aqui). */
export function workspaceEmail(recipient, { subject, lines, projectId, cta = "Abrir o espaço do projeto" }) {
  if (!recipient?.email) return Promise.resolve({ simulated: true });
  return sendEmail({
    to: recipient.email,
    subject,
    html: `<p>Olá, ${escapeHtml(recipient.name)}!</p>${lines.map((l) => `<p style="white-space:pre-wrap">${escapeHtml(l)}</p>`).join("")}`,
    cta: { label: cta, path: `projeto.html?id=${projectId}` },
  });
}
