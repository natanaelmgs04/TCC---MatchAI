import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  amountInWords,
  briefingToText,
  buildIcs,
  buildPixPayload,
  buildReceipt,
  crc16,
  deviceLabel,
  dueMaintenance,
  dueMeetingReminders,
  legalDocsOf,
  maintenancePlanFrom,
  meetingStatus,
  normalizeBriefingAnswers,
  normalizeBriefingQuestions,
  normalizeMeeting,
  normalizePixKey,
  normalizePixProfile,
  normalizeTaxId,
  rrtOf,
} from "../src/services/officeRules.js";

test("Pix: CRC e payload batem com o exemplo do manual do Banco Central", () => {
  const body = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
  assert.equal(crc16(body), "1D3D");
  assert.equal(buildPixPayload({ key: "123e4567-e12b-12d1-a456-426655440000", name: "Fulano de Tal", city: "BRASILIA" }), `${body}1D3D`);
});

test("Pix: cobrança com valor, txid e nome sem acento; o CRC confere o resto do código", () => {
  const p = buildPixPayload({ key: "teresa@exemplo.com", name: "Teresa Younes Arquitetura Ltda", city: "São Paulo", amount: 2500, txid: "MIA-ab12cd34-E1" });
  assert.match(p, /54072500\.00/);
  assert.match(p, /5925Teresa Younes Arquitetura/);
  assert.match(p, /6009Sao Paulo/);
  assert.match(p, /0513MIAab12cd34E1/);
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
});

test("Pix: chaves e documentos validados (CPF/CNPJ com dígito, celular com +55)", () => {
  assert.deepEqual(normalizePixKey("cpf", "529.982.247-25"), { key: "52998224725" });
  assert.ok(normalizePixKey("cpf", "111.111.111-11").error);
  assert.deepEqual(normalizePixKey("cnpj", "11.222.333/0001-81"), { key: "11222333000181" });
  assert.deepEqual(normalizePixKey("phone", "(11) 98888-7777"), { key: "+5511988887777" });
  assert.deepEqual(normalizePixKey("email", "Teresa@Exemplo.com"), { key: "teresa@exemplo.com" });
  assert.ok(normalizePixKey("random", "nao-e-uuid").error);
  assert.ok(normalizePixProfile({ type: "email", key: "a@b.co", name: "T", city: "SP" }).error);
  assert.deepEqual(normalizePixProfile({}), { pix: null });
  assert.deepEqual(normalizeTaxId(""), { taxId: "" });
  assert.ok(normalizeTaxId("123.456.789-00").error);
});

test("recibo: valor por extenso e código que muda junto com o conteúdo", () => {
  assert.equal(amountInWords(1500), "mil e quinhentos reais");
  assert.equal(amountInWords(1234.56), "mil duzentos e trinta e quatro reais e cinquenta e seis centavos");
  assert.equal(amountInWords(101), "cento e um reais");
  assert.equal(amountInWords(1), "um real");
  assert.equal(amountInWords(0.5), "cinquenta centavos");
  assert.equal(amountInWords(2000000), "dois milhões de reais");
  assert.equal(amountInWords(21000), "vinte e um mil reais");
  const args = {
    project: { _id: "665f1c2e9b1e8a0012abcdef", name: "Casa Jardins", city: "São Paulo", state: "SP" },
    stage: { name: "Anteprojeto", fee: 3200, feePaidAt: new Date("2026-05-10T15:00:00Z") },
    stageIndex: 1,
    client: { name: "Bruno Cliente" },
    architect: { name: "Teresa Younes", architectProfile: { taxId: "52998224725", cauVerification: { number: "A12345-6" } } },
    rrt: "1234567",
    contractVersion: 2,
  };
  const r = buildReceipt(args);
  assert.equal(r.number, "2026-ABCDEF-2");
  assert.equal(r.payeeDocument, "CPF 529.982.247-25");
  assert.match(r.text, /Recebi de Bruno Cliente a importância de R\$ 3\.200,00 \(três mil e duzentos reais\)/);
  assert.match(r.text, /RRT nº 1234567/);
  assert.match(r.code, /^[0-9A-F]{16}$/);
  assert.notEqual(buildReceipt({ ...args, stage: { ...args.stage, fee: 3201 } }).code, r.code);
});

test("agenda: horário no futuro, situação pelas respostas e lembrete 24 h antes, uma vez", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  assert.ok(normalizeMeeting({ startsAt: "2026-10-16T12:00:00Z" }, now).error);
  assert.ok(normalizeMeeting({ startsAt: "xx" }, now).error);
  const ok = normalizeMeeting({ kind: "visita", startsAt: "2026-10-18T09:00:00Z", durationMin: 5000 }, now).meeting;
  assert.equal(ok.title, "Visita de obra");
  assert.equal(ok.durationMin, 480);
  assert.equal(meetingStatus({ clientAnswer: "yes", architectAnswer: "pending" }), "pending");
  assert.equal(meetingStatus({ clientAnswer: "yes", architectAnswer: "yes" }), "confirmed");
  assert.equal(meetingStatus({ clientAnswer: "no", architectAnswer: "yes" }), "declined");
  assert.equal(meetingStatus({ cancelledAt: now }), "cancelled");
  const list = [
    { startsAt: new Date("2026-10-18T09:00:00Z"), clientAnswer: "yes", architectAnswer: "yes" },
    { startsAt: new Date("2026-10-18T09:00:00Z"), clientAnswer: "yes", architectAnswer: "yes", remindedAt: now },
    { startsAt: new Date("2026-10-20T09:00:00Z"), clientAnswer: "yes", architectAnswer: "yes" },
    { startsAt: new Date("2026-10-18T09:00:00Z"), clientAnswer: "no", architectAnswer: "yes" },
  ];
  assert.equal(dueMeetingReminders(list, now).length, 1);
});

test("agenda: convite .ics válido, com texto escapado e linhas dobradas em 75 bytes", () => {
  const ics = buildIcs({ uid: "abc", title: "Visita; revisão, cozinha", startsAt: new Date("2026-11-03T13:00:00Z"), durationMin: 90, place: "Rua A, 1", description: "linha 1\nlinha 2 ".repeat(8), url: "https://x.test/p", now: new Date("2026-10-17T00:00:00Z") });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261103T130000Z\r\nDTEND:20261103T143000Z/);
  assert.match(ics, /SUMMARY:Visita\\; revisão\\, cozinha/);
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75, line);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("documentos: lista padrão até alguém mexer, e o número do RRT", () => {
  const def = legalDocsOf([]);
  assert.equal(def[0].key, "rrt");
  assert.ok(def.every((d) => d.status === "pendente"));
  assert.equal(rrtOf(def), "");
  assert.equal(rrtOf([{ key: "rrt", number: "998877" }]), "998877");
});

test("manual da casa: manutenção a partir dos materiais e dos ofícios; vencidas uma vez por ciclo", () => {
  const start = new Date("2026-10-01T00:00:00Z");
  const plan = maintenancePlanFrom({ library: [{ name: "Porcelanato 90x90", category: "Revestimento" }, { name: "Bancada em granito" }], crew: [{ trade: "Ar-condicionado", name: "Frio Bom" }] }, start);
  const ids = plan.map((t) => t.ruleId);
  assert.deepEqual(ids, ["caixa-dagua", "rejunte", "pedras", "ar"]);
  assert.equal(plan.find((t) => t.ruleId === "ar").nextAt.toISOString().slice(0, 10), "2027-01-01");
  assert.equal(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10), "2026-02-28");
  const now = new Date("2027-05-01T00:00:00Z");
  assert.equal(dueMaintenance(plan, now).length, 2); // caixa d'água (abr) e ar (jan)
  plan[0].remindedAt = now;
  assert.equal(dueMaintenance(plan, now).length, 1);
});

test("briefing: perguntas validadas, respostas obrigatórias e só opções existentes", () => {
  assert.ok(normalizeBriefingQuestions([{ text: "Uma só?" }]).error);
  assert.ok(normalizeBriefingQuestions([{ text: "Quem mora?" }, { text: "Ambientes?", type: "multi", options: ["Sala"] }, { text: "Prazo?" }]).error);
  const { questions } = normalizeBriefingQuestions([
    { id: "q1", text: "Quem vai morar?", required: true },
    { id: "q1", text: "Estilo de vida?", type: "choice", options: ["Calmo", "Agitado", "Calmo"] },
    { text: "Ambientes?", type: "multi", options: ["Sala", "Cozinha", "Varanda"], required: true },
  ]);
  assert.equal(questions.length, 3);
  assert.notEqual(questions[1].id, "q1");
  assert.deepEqual(questions[1].options, ["Calmo", "Agitado"]);
  assert.ok(normalizeBriefingAnswers(questions, { q1: "Casal" }).error);
  const { answers } = normalizeBriefingAnswers(questions, { q1: "Casal com um filho", [questions[1].id]: "Inventado", [questions[2].id]: ["Sala", "Garagem", "Varanda"] });
  assert.deepEqual(answers, [{ id: "q1", value: "Casal com um filho" }, { id: questions[2].id, value: ["Sala", "Varanda"] }]);
  assert.equal(briefingToText(questions, answers), "- Quem vai morar? Casal com um filho\n- Ambientes? Sala, Varanda");
});

test("aviso de acesso: nome do aparelho a partir do navegador", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0"), "Edge no Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"), "Safari no iPhone/iPad");
  assert.equal(deviceLabel(""), "navegador");
});
