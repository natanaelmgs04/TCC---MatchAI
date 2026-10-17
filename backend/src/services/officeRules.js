import crypto from "node:crypto";

/**
 * Regras puras (sem banco) da rotina de escritório no Espaço do projeto:
 * Pix dos honorários (padrão BR Code do Banco Central), recibo, agenda
 * (convite .ics), documentos legais (RRT do CAU, alvará…), plano de
 * manutenção do "manual da casa", briefing do arquiteto e o nome do aparelho
 * nos avisos de acesso.
 */
const DAY = 24 * 60 * 60 * 1000;
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ascii = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "");
const digits = (s) => String(s || "").replace(/\D/g, "");

// ---------------------------------------------------------------------------
// Pix (BR Code estático com valor — Manual de Padrões para Iniciação do Pix, BCB)
// ---------------------------------------------------------------------------
export const PIX_KEY_TYPES = { cpf: "CPF", cnpj: "CNPJ", email: "E-mail", phone: "Celular", random: "Chave aleatória" };

function cpfValid(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (len) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjValid(d) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (len) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((t, x, i) => t + x * Number(d[i]), 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/** Documento do arquiteto para o recibo (opcional): CPF ou CNPJ válido, guardado só com dígitos. */
export function normalizeTaxId(raw) {
  const d = digits(raw);
  if (!d) return { taxId: "" };
  if (d.length === 11 && cpfValid(d)) return { taxId: d };
  if (d.length === 14 && cnpjValid(d)) return { taxId: d };
  return { error: "CPF ou CNPJ inválido — confira os números." };
}

export const formatTaxId = (d) => (d?.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d?.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "");

/** Chave Pix no formato que vai dentro do BR Code. */
export function normalizePixKey(type, raw) {
  const v = String(raw || "").trim();
  if (!PIX_KEY_TYPES[type]) return { error: "Escolha o tipo da chave Pix." };
  if (type === "cpf") return cpfValid(digits(v)) ? { key: digits(v) } : { error: "CPF inválido." };
  if (type === "cnpj") return cnpjValid(digits(v)) ? { key: digits(v) } : { error: "CNPJ inválido." };
  if (type === "email") {
    const e = v.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 77 ? { key: e } : { error: "E-mail inválido." };
  }
  if (type === "phone") {
    let d = digits(v);
    if (d.length === 10 || d.length === 11) d = `55${d}`;
    return /^55\d{10,11}$/.test(d) ? { key: `+${d}` } : { error: "Celular inválido — use DDD + número." };
  }
  const k = v.toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k) ? { key: k } : { error: "Chave aleatória inválida (formato 123e4567-e89b-12d3-a456-426614174000)." };
}

/** Dados de recebimento do arquiteto (perfil). */
export function normalizePixProfile(body = {}) {
  if (!body.key) return { pix: null };
  const k = normalizePixKey(body.type, body.key);
  if (k.error) return k;
  const name = ascii(str(body.name, 60)).trim().slice(0, 25);
  const city = ascii(str(body.city, 60)).trim().slice(0, 15);
  if (name.length < 3) return { error: "Informe o nome do recebedor (como aparece no banco)." };
  if (city.length < 2) return { error: "Informe a cidade do recebedor." };
  return { pix: { type: body.type, key: k.key, name, city } };
}

export function crc16(payload) {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const tlv = (id, value) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** "Pix copia e cola" de uma cobrança: vai direto para a conta do arquiteto (a plataforma não toca no dinheiro). */
export function buildPixPayload({ key, name, city, amount, txid, description }) {
  const desc = ascii(description || "").slice(0, 40);
  const account = tlv("00", "br.gov.bcb.pix") + tlv("01", key) + (desc && key.length + desc.length <= 60 ? tlv("02", desc) : "");
  const id = ascii(txid || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const body = [
    tlv("00", "01"),
    tlv("26", account),
    tlv("52", "0000"),
    tlv("53", "986"),
    amount ? tlv("54", Number(amount).toFixed(2)) : "",
    tlv("58", "BR"),
    tlv("59", ascii(name).slice(0, 25)),
    tlv("60", ascii(city).slice(0, 15)),
    tlv("62", tlv("05", id)),
    "6304",
  ].join("");
  return body + crc16(body);
}

// ---------------------------------------------------------------------------
// Recibo de honorários
// ---------------------------------------------------------------------------
const UNITS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function under1000(n) {
  if (n === 100) return "cem";
  const parts = [];
  if (n >= 100) parts.push(HUNDREDS[Math.floor(n / 100)]);
  const r = n % 100;
  if (r) parts.push(r < 20 ? UNITS[r] : TENS[Math.floor(r / 10)] + (r % 10 ? ` e ${UNITS[r % 10]}` : ""));
  return parts.join(" e ");
}

function integerWords(n) {
  if (n === 0) return "zero";
  const groups = [
    { value: Math.floor(n / 1e6) % 1000, word: (v) => (v === 1 ? "um milhão" : `${under1000(v)} milhões`) },
    { value: Math.floor(n / 1000) % 1000, word: (v) => (v === 1 ? "mil" : `${under1000(v)} mil`) },
    { value: n % 1000, word: under1000 },
  ].filter((g) => g.value);
  return groups.map((g, i) => {
    const text = g.word(g.value);
    if (i === 0) return text;
    // "mil e quinhentos", "mil e vinte", mas "mil duzentos e trinta"
    return (g.value < 100 || g.value % 100 === 0 ? " e " : " ") + text;
  }).join("");
}

/** Valor por extenso, como vai no recibo: 1234.56 → "mil duzentos e trinta e quatro reais e cinquenta e seis centavos". */
export function amountInWords(value) {
  const cents = Math.round(Number(value) * 100);
  const reais = Math.floor(cents / 100);
  const c = cents % 100;
  const parts = [];
  if (reais) {
    const exactMillions = reais >= 1e6 && reais % 1e6 === 0;
    parts.push(`${integerWords(reais)}${exactMillions ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  }
  if (c) parts.push(`${integerWords(c)} ${c === 1 ? "centavo" : "centavos"}`);
  return parts.join(" e ") || "zero reais";
}

const brl = (n) => `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Número e texto do recibo de uma etapa paga; o código muda se qualquer dado mudar. */
export function buildReceipt({ project, stage, stageIndex, client, architect, rrt, contractVersion }) {
  const paidAt = stage.feePaidAt || new Date();
  const number = `${new Date(paidAt).getUTCFullYear()}-${String(project._id).slice(-6).toUpperCase()}-${stageIndex + 1}`;
  const where = [project.city, project.state].filter(Boolean).join("/");
  const taxId = architect.architectProfile?.taxId;
  const cau = architect.architectProfile?.cauVerification?.number;
  const receipt = {
    number,
    value: stage.fee,
    valueText: brl(stage.fee),
    valueWords: amountInWords(stage.fee),
    paidAt: new Date(paidAt).toISOString(),
    payer: client.name,
    payee: architect.name,
    payeeDocument: taxId ? `${taxId.length === 11 ? "CPF" : "CNPJ"} ${formatTaxId(taxId)}` : "",
    payeeCau: cau || "",
    text: `Recebi de ${client.name} a importância de ${brl(stage.fee)} (${amountInWords(stage.fee)}), referente aos honorários da etapa "${stage.name}" do projeto de arquitetura "${project.name}"${where ? `, em ${where}` : ""}${contractVersion ? `, conforme contrato assinado na plataforma (versão ${contractVersion})` : ""}${rrt ? `, RRT nº ${rrt}` : ""}.`,
    place: project.city || "",
    dateText: fmtDate(paidAt),
  };
  receipt.code = crypto.createHash("sha256").update(JSON.stringify(receipt)).digest("hex").slice(0, 16).toUpperCase();
  return receipt;
}

// ---------------------------------------------------------------------------
// Agenda: reuniões e visitas de obra
// ---------------------------------------------------------------------------
export const MEETING_KINDS = { reuniao: "Reunião", visita: "Visita de obra", apresentacao: "Apresentação do projeto", medicao: "Visita técnica / medição" };

export function normalizeMeeting(body = {}, now = new Date()) {
  const kind = MEETING_KINDS[body.kind] ? body.kind : "reuniao";
  const startsAt = new Date(body.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { error: "Escolha o dia e o horário." };
  if (startsAt.getTime() < now.getTime() - 5 * 60 * 1000) return { error: "Escolha um horário a partir de agora." };
  if (startsAt.getTime() > now.getTime() + 366 * DAY) return { error: "Marque com até um ano de antecedência." };
  const durationMin = Math.max(15, Math.min(480, Math.round(Number(body.durationMin) || 60)));
  const title = str(body.title, 100) || MEETING_KINDS[kind];
  return { meeting: { kind, title, startsAt, durationMin, place: str(body.place, 200), note: str(body.note, 600) } };
}

/** Situação da reunião a partir das respostas das duas partes. */
export function meetingStatus(m) {
  if (m.cancelledAt) return "cancelled";
  if (m.clientAnswer === "no" || m.architectAnswer === "no") return "declined";
  if (m.clientAnswer === "yes" && m.architectAnswer === "yes") return "confirmed";
  return "pending";
}

/** Lembrete 24 h antes, uma vez, para reuniões que não foram canceladas nem recusadas. */
export function dueMeetingReminders(meetings = [], now = new Date()) {
  return meetings.filter((m) => {
    const t = new Date(m.startsAt).getTime();
    return !m.remindedAt && t > now.getTime() && t - now.getTime() <= DAY && ["pending", "confirmed"].includes(meetingStatus(m));
  });
}

const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Linhas de até 75 bytes (RFC 5545), sem cortar um caractere acentuado no meio. */
function fold(line) {
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** Convite para Google Agenda / Outlook / Apple Calendário. */
export function buildIcs({ uid, title, startsAt, durationMin, place, description, url, now = new Date() }) {
  const end = new Date(new Date(startsAt).getTime() + durationMin * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//match.IA//Espaco do projeto//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@matchia`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(title)}`,
    ...(place ? [`LOCATION:${icsText(place)}`] : []),
    ...(description ? [`DESCRIPTION:${icsText(description)}`] : []),
    ...(url ? [`URL:${url}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------
// Documentos legais da obra
// ---------------------------------------------------------------------------
export const LEGAL_STATUS = { pendente: "Pendente", andamento: "Em andamento", concluido: "Concluído", nao_aplica: "Não se aplica" };

export const DEFAULT_LEGAL_DOCS = [
  { key: "rrt", name: "RRT do projeto (CAU)", hint: "Registro de Responsabilidade Técnica emitido no SICCAU antes de começar o projeto." },
  { key: "condominio", name: "Aprovação do condomínio", hint: "Reforma em apartamento: plano de reforma conforme a NBR 16.280, entregue ao síndico." },
  { key: "prefeitura", name: "Projeto aprovado na prefeitura", hint: "Projeto legal / alvará de construção ou reforma, quando o município exige." },
  { key: "alvara", name: "Alvará de execução da obra", hint: "Licença para começar a obra, quando exigida." },
  { key: "art-execucao", name: "ART/RRT de execução", hint: "Responsável técnico pela execução da obra (engenheiro ou arquiteto)." },
  { key: "habite-se", name: "Habite-se / certificado de conclusão", hint: "Obras novas e ampliações, ao terminar." },
];

/** A lista do projeto ou, enquanto ninguém mexeu, a lista padrão (sem gravar). */
export function legalDocsOf(list = []) {
  if (list.length) return list;
  return DEFAULT_LEGAL_DOCS.map((d) => ({ ...d, status: "pendente" }));
}

export function normalizeLegalDocUpdate(body = {}) {
  const out = {};
  if (body.status !== undefined) {
    if (!LEGAL_STATUS[body.status]) return { error: "Situação inválida." };
    out.status = body.status;
  }
  if (body.number !== undefined) out.number = str(body.number, 60);
  if (body.note !== undefined) out.note = str(body.note, 300);
  if (body.date !== undefined) {
    const d = body.date ? new Date(body.date) : null;
    if (d && Number.isNaN(d.getTime())) return { error: "Data inválida." };
    out.date = d || undefined;
  }
  return { changes: out };
}

export function normalizeCustomLegalDoc(body = {}) {
  const name = str(body.name, 80);
  if (name.length < 3) return { error: "Dê um nome ao documento." };
  return { doc: { key: `custom-${crypto.randomBytes(4).toString("hex")}`, name, hint: str(body.hint, 200), status: "pendente" } };
}

/** Número do RRT do projeto, se já foi emitido. */
export const rrtOf = (list = []) => {
  const d = list.find((x) => x.key === "rrt");
  return d && d.number ? d.number : "";
};

// ---------------------------------------------------------------------------
// Manual da casa: plano de manutenção a partir do que foi usado na obra
// ---------------------------------------------------------------------------
export const MAINTENANCE_RULES = [
  { id: "caixa-dagua", task: "Limpar e desinfetar a caixa d'água", everyMonths: 6, always: true },
  { id: "impermeabilizacao", task: "Revisar a impermeabilização de lajes, terraços e áreas molhadas", everyMonths: 12, match: /impermeabiliz|manta asf/i },
  { id: "rejunte", task: "Conferir e refazer rejuntes de banheiros, cozinha e área de serviço", everyMonths: 12, match: /porcelanato|cer[aâ]mic|revestimento|rejunte|azulejo|pastilha|piso/i },
  { id: "pedras", task: "Reimpermeabilizar pedras naturais (bancadas e pisos de mármore/granito)", everyMonths: 12, match: /m[aá]rmore|granito|quartzito|travertino|pedra|marmoraria/i },
  { id: "madeira", task: "Tratar madeiras expostas (deck, ripados, portas) com óleo ou verniz", everyMonths: 12, match: /madeira|deck|ripad|cumaru|freij/i },
  { id: "marcenaria", task: "Ajustar dobradiças, corrediças e puxadores da marcenaria", everyMonths: 12, match: /marcenaria|arm[aá]rio|mdf|planejad|gaveteiro|painel/i },
  { id: "pintura", task: "Retocar a pintura interna (externa: a cada 3 anos)", everyMonths: 24, match: /tinta|pintura|esmalte|textura/i },
  { id: "ar", task: "Limpar os filtros do ar-condicionado (higienização completa uma vez por ano)", everyMonths: 3, match: /ar[- ]?condicionado|split|climatiza/i },
  { id: "esquadrias", task: "Limpar trilhos e conferir borrachas e vedação de janelas, portas de vidro e box", everyMonths: 6, match: /vidro|esquadria|janela|box|vidra[cç]aria|serralheria|alum[ií]nio/i },
  { id: "eletrica", task: "Revisão do quadro elétrico e teste do DR por eletricista", everyMonths: 24, match: /el[eé]tric|lumin|ilumina|l[aâ]mpada|pendente|spot|fita de led/i },
  { id: "hidraulica", task: "Limpar arejadores das torneiras e procurar vazamentos (contas de água, manchas)", everyMonths: 6, match: /torneira|metais|hidr[aá]ulic|chuveiro|registro|v[aá]lvula|misturador|cuba/i },
  { id: "jardim", task: "Podar, adubar e revisar a irrigação do jardim", everyMonths: 3, match: /paisag|jardim|planta|vaso|grama/i },
  { id: "gesso", task: "Verificar trincas e manchas de umidade no forro de gesso", everyMonths: 12, match: /gesso|drywall|forro/i },
];

export function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Tarefas de manutenção que fazem sentido para ESTA obra (itens da biblioteca + ofícios da equipe de obra). */
export function maintenancePlanFrom({ library = [], crew = [] } = {}, start = new Date()) {
  const texts = [
    ...library.map((i) => ({ label: i.name, text: `${i.name} ${i.category || ""}` })),
    ...crew.map((c) => ({ label: c.trade || c.name, text: `${c.trade || ""} ${c.name || ""}` })),
  ];
  return MAINTENANCE_RULES.flatMap((r) => {
    const because = r.always ? [] : [...new Set(texts.filter((t) => r.match.test(t.text)).map((t) => t.label))];
    if (!r.always && !because.length) return [];
    return [{ ruleId: r.id, task: r.task, everyMonths: r.everyMonths, because: because.slice(0, 4).join(", "), nextAt: addMonths(start, r.everyMonths) }];
  });
}

export function normalizeMaintenanceTask(body = {}, start = new Date()) {
  const task = str(body.task, 160);
  if (task.length < 5) return { error: "Descreva a manutenção." };
  const everyMonths = Math.round(Number(body.everyMonths));
  if (!(everyMonths >= 1 && everyMonths <= 120)) return { error: "A frequência vai de 1 a 120 meses." };
  return { task: { ruleId: "custom", task, everyMonths, because: str(body.because, 120), nextAt: addMonths(start, everyMonths) } };
}

/** Manutenções vencidas que ainda não foram lembradas neste ciclo. */
export function dueMaintenance(tasks = [], now = new Date()) {
  return tasks.filter((t) => t.nextAt && new Date(t.nextAt) <= now && !(t.remindedAt && new Date(t.remindedAt) >= new Date(t.nextAt)));
}

// ---------------------------------------------------------------------------
// Briefing do arquiteto (programa de necessidades)
// ---------------------------------------------------------------------------
export const BRIEFING_TYPES = { text: "Resposta livre", choice: "Uma opção", multi: "Várias opções" };

export const DEFAULT_BRIEFING = [
  { id: "q1", text: "Quem vai morar ou usar o espaço? (pessoas, idades)", type: "text", required: true },
  { id: "q2", text: "Como é a rotina da casa num dia comum?", type: "text", required: false },
  { id: "q3", text: "Quais ambientes o projeto precisa ter?", type: "multi", required: true, options: ["Sala de estar", "Sala de jantar", "Cozinha integrada", "Home office", "Suíte", "Quarto de hóspedes", "Área gourmet", "Lavanderia", "Varanda", "Closet", "Brinquedoteca", "Academia"] },
  { id: "q4", text: "O que é mais importante para você?", type: "multi", required: true, options: ["Luz natural", "Ambientes integrados", "Privacidade", "Muito armazenamento", "Baixa manutenção", "Sustentabilidade", "Acessibilidade", "Conforto acústico"] },
  { id: "q5", text: "Tem pets? Quais?", type: "text", required: false },
  { id: "q6", text: "Quanto pretende investir na obra (sem os honorários)?", type: "choice", required: true, options: ["Até R$ 50 mil", "De R$ 50 a 150 mil", "De R$ 150 a 400 mil", "Acima de R$ 400 mil", "Ainda não sei"] },
  { id: "q7", text: "Para quando você quer a obra pronta?", type: "text", required: false },
  { id: "q8", text: "O que você NÃO quer de jeito nenhum?", type: "text", required: false },
  { id: "q9", text: "Algo da casa atual precisa ficar? (móveis, objetos, lembranças)", type: "text", required: false },
  { id: "q10", text: "Referências: links de fotos ou perfis de que você gosta", type: "text", required: false },
];

export function normalizeBriefingQuestions(list) {
  if (!Array.isArray(list)) return { error: "Envie as perguntas." };
  const used = new Set();
  const questions = [];
  for (const q of list) {
    const text = str(q?.text, 200);
    if (text.length < 5) continue;
    const type = BRIEFING_TYPES[q?.type] ? q.type : "text";
    const options = type === "text" ? [] : [...new Set((Array.isArray(q.options) ? q.options : []).map((o) => str(o, 60)).filter(Boolean))].slice(0, 12);
    if (type !== "text" && options.length < 2) return { error: `A pergunta "${text}" precisa de pelo menos 2 opções.` };
    let id = typeof q.id === "string" && /^[a-z0-9-]{1,24}$/.test(q.id) && !used.has(q.id) ? q.id : "";
    if (!id) do id = `q${crypto.randomBytes(3).toString("hex")}`; while (used.has(id));
    used.add(id);
    questions.push({ id, text, type, required: !!q.required, ...(options.length ? { options } : {}) });
  }
  if (questions.length < 3 || questions.length > 25) return { error: "O briefing tem de 3 a 25 perguntas." };
  return { questions };
}

export function normalizeBriefingAnswers(questions = [], answers = {}) {
  const out = [];
  for (const q of questions) {
    const raw = answers?.[q.id];
    let value;
    if (q.type === "text") value = str(raw, 1500);
    else if (q.type === "choice") value = q.options.includes(raw) ? raw : "";
    else value = [...new Set((Array.isArray(raw) ? raw : []).filter((o) => q.options.includes(o)))];
    const empty = Array.isArray(value) ? !value.length : !value;
    if (q.required && empty) return { error: `Responda: "${q.text}"` };
    if (!empty) out.push({ id: q.id, value });
  }
  return { answers: out };
}

/** O briefing respondido em texto (assistente de IA do arquiteto, proposta). */
export function briefingToText(questions = [], answers = []) {
  const byId = new Map(answers.map((a) => [a.id, a.value]));
  return questions
    .filter((q) => byId.has(q.id))
    .map((q) => `- ${q.text} ${Array.isArray(byId.get(q.id)) ? byId.get(q.id).join(", ") : byId.get(q.id)}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Aparelho nos avisos de acesso ("Chrome no Windows")
// ---------------------------------------------------------------------------
export function deviceLabel(ua = "") {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "navegador";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} no ${os}` : browser;
}
