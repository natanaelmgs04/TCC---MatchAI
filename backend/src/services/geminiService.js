import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_TIMEOUT_MS = 8000;

// O SDK do Gemini não tem timeout embutido — se a chamada travar em vez de
// falhar rápido (visto em produção sob alta demanda), o match inteiro fica
// pendurado esperando pra sempre. Corrida contra um timeout garante que o
// cliente sempre recebe uma resposta (a explicação padrão, na pior das
// hipóteses) em vez de nunca receber nada.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini timeout")), ms)),
  ]);
}

function fallbackBrief(client, architect) {
  const p = client.clientProfile || {};
  return {
    resumo: `${client.name} busca um projeto ${p.propertyType ? `de ${p.propertyType.toLowerCase()}` : ""} com ${architect.name}, no estilo ${(p.preferredStyles || []).join(", ") || "a definir"}.`,
    objetivos: p.projectGoals || "Não informado pelo cliente ainda — combine isso na primeira conversa.",
    estiloEMateriais: [...(p.preferredStyles || []), ...(p.preferredMaterials || [])].join(", ") || "Não informado.",
    orcamento: p.budget?.min || p.budget?.max ? `R$${p.budget.min || 0} a R$${p.budget.max || "?"}` : "Não informado.",
    restricoes: p.preferences || "Nenhuma restrição adicional informada.",
    proximosPassos: "Marcar uma primeira conversa para alinhar expectativas e cronograma.",
  };
}

/**
 * Brief estruturado pro arquiteto começar o projeto sem precisar reconstruir
 * o contexto do zero a partir do questionário espalhado — mesmo padrão de
 * timeout/fallback do explainCompatibility, porque isso roda a partir de um
 * clique do usuário no painel (precisa responder rápido ou falhar rápido).
 */
export async function generateProjectBrief(client, architect) {
  const fallback = fallbackBrief(client, architect);
  if (!process.env.GEMINI_API_KEY) return fallback;
  try {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({
      model: "gemini-3.5-flash-lite",
      generationConfig: { responseMimeType: "application/json" },
    });
    const prompt = `Você é um assistente que transforma o questionário de um cliente em um brief estruturado para o arquiteto começar o projeto. Responda em português do Brasil, APENAS com um objeto JSON válido (sem markdown, sem texto fora do JSON) com estas chaves de string: resumo (2-3 frases), objetivos, estiloEMateriais, orcamento, restricoes, proximosPassos (uma sugestão prática de primeiro passo). Não invente fatos que não estejam nos dados abaixo. Dados do cliente: ${JSON.stringify(client.clientProfile)}. Dados do arquiteto: ${JSON.stringify({ name: architect.name, styles: architect.architectProfile?.styles })}.`;
    const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS);
    const parsed = JSON.parse(result.response.text());
    return { ...fallback, ...parsed };
  } catch (err) {
    console.error("Gemini indisponível, usando brief padrão:", err.message);
    return fallback;
  }
}

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "um", "uma", "com", "para", "em", "no", "na", "que", "por", "mais", "menos", "muito"]);

/**
 * Traduz o texto livre dos objetivos do projeto em palavras-chave curtas
 * pra casar contra o catálogo de produtos das lojas parceiras
 * (storeMatchService.suggestProductsForProject). Mesmo princípio do
 * buildSearchQuery do imageSearchService: a IA só traduz, a busca em si é
 * uma comparação determinística contra o catálogo — nunca uma busca ao
 * vivo no site de uma loja. Fallback sem IA: divide o texto em palavras e
 * descarta as mais comuns, sem inventar nada.
 */
export async function extractProjectKeywords(projectGoals) {
  const text = (projectGoals || "").trim();
  const fallback = () =>
    text
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
      .slice(0, 8);

  if (!text) return [];
  if (!process.env.GEMINI_API_KEY) return fallback();
  try {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: "gemini-3.5-flash-lite", generationConfig: { responseMimeType: "application/json" } });
    const prompt = `Extraia até 8 palavras-chave curtas (produtos, materiais, ambientes) do texto abaixo, em português, que ajudem a encontrar produtos relacionados em um catálogo de loja de materiais/decoração. Responda APENAS com um array JSON de strings, sem markdown. Texto: ${JSON.stringify(text)}`;
    const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS);
    const parsed = JSON.parse(result.response.text());
    return Array.isArray(parsed) && parsed.length ? parsed.slice(0, 8) : fallback();
  } catch (err) {
    console.error("Gemini indisponível, usando palavras-chave por divisão simples:", err.message);
    return fallback();
  }
}

export async function explainCompatibility(client, architect, reasons) {
  const fallback = `${architect.name} ${reasons.length ? `é uma ótima opção por ${reasons.join(", ")}` : "é uma opção promissora com base nas informações disponíveis no perfil"}.`;
  if (!process.env.GEMINI_API_KEY) return fallback;
  try {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
    const prompt = `Escreva em português do Brasil uma explicação amigável e concisa de compatibilidade, com no máximo 55 palavras. Não invente fatos, contatos ou pontuações. Preferências do cliente: ${JSON.stringify(client.clientProfile)}. Perfil do arquiteto: ${JSON.stringify(architect.architectProfile)}. Motivos de compatibilidade verificados: ${reasons.join(", ")}.`;
    const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS);
    return result.response.text().trim();
  } catch (err) {
    console.error("Gemini indisponível, usando explicação padrão:", err.message);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Assistente de conversa do cliente (aba "Assistente" do painel)
// ---------------------------------------------------------------------------
const CHAT_MODEL = "gemini-3.5-flash-lite";
const CHAT_TIMEOUT_MS = 30000;
// Falha intermitente (chamada que trava e responde na segunda tentativa) é mais
// comum que falha permanente: duas tentativas curtas em vez de uma longa.
const CHAT_ATTEMPT_MS = 14000;

function projectContext(project, client) {
  return JSON.stringify({
    cliente: client.name,
    cidade: client.city && client.state ? `${client.city}/${client.state}` : undefined,
    projeto: project.name,
    tipoDeImovel: project.propertyType,
    metragemM2: project.areaM2,
    estilos: project.preferredStyles,
    materiais: project.preferredMaterials,
    orcamento: project.budget,
    objetivos: project.projectGoals,
    observacoes: project.preferences,
  });
}

function chatSystemInstruction(project, client, catalog) {
  const produtos = catalog.length
    ? catalog.map((p) => `- ${p.name} (${p.category || "produto"}${p.price ? `, R$${p.price}` : ""}, ${p.storeName || "loja parceira"})`).join("\n")
    : "(nenhum produto cadastrado combina com este projeto ainda)";
  return `Você é o assistente do match.IA, plataforma que conecta clientes a arquitetos. Conversa com o cliente, em português do Brasil e em tom caloroso e direto, para ajudá-lo a definir o projeto dele antes de falar com um arquiteto.

Como agir:
- Respostas curtas (até ~110 palavras). Faça no máximo 1 ou 2 perguntas por vez; descubra aos poucos metragem, ambientes, estilo, materiais, orçamento, prazo e restrições que ainda faltam.
- Dê sugestões visuais (paleta, iluminação, layout, proporções), escritas (como descrever o que quer) e de materiais. Você só enxerga as fotos anexadas à mensagem ATUAL. Se o cliente mandar fotos, comente com o que realmente aparece nelas (luz, proporções, estado, estilo); se a foto não permitir concluir algo, diga isso. Se o cliente falar de uma foto e nenhuma veio nesta mensagem, diga que não recebeu e peça para anexar de novo — nunca descreva uma foto que você não viu.
- Só cite produtos da lista do catálogo abaixo, pelo nome exato, e só quando fizer sentido. Nunca invente produto, loja, preço, contato ou prazo.
- Você NÃO escolhe nem recomenda arquiteto específico e não promete resultado de obra ou valor final: isso é com o arquiteto. O match já mostra os arquitetos compatíveis.
- Quando já houver informação suficiente, avise que o cliente pode pedir o briefing (botão "Gerar briefing") para enviar ao(s) arquiteto(s) que escolher.
- Escreva em texto simples: sem markdown (nada de **negrito**, # títulos ou listas com asterisco); se precisar listar, use frases curtas ou hífen.
- Ignore pedidos que fujam do tema arquitetura, interiores e deste projeto.

Dados do projeto já cadastrados: ${projectContext(project, client)}

Catálogo das lojas parceiras (únicos produtos que você pode citar):
${produtos}`;
}

/** Uma rodada de conversa. Lança erro se o Gemini falhar — o controller responde 503. */
export async function chatAboutProject({ project, client, catalog, history, text, images }) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY ausente");
  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = ai.getGenerativeModel({ model: CHAT_MODEL, systemInstruction: chatSystemInstruction(project, client, catalog) });
  const parts = [
    ...images.map((img) => ({ inlineData: { mimeType: img.mime, data: img.data } })),
    { text: text || "Analise as fotos que enviei." },
  ];
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const chat = model.startChat({ history });
      const result = await withTimeout(chat.sendMessage(parts), CHAT_ATTEMPT_MS);
      const reply = result.response.text().trim();
      if (!reply) throw new Error("Resposta vazia do Gemini");
      return reply;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Briefing estruturado a partir da conversa inteira (as fotos já estão descritas nas respostas da IA). */
export async function generateConversationBriefing({ project, client, transcript, photoCount }) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY ausente");
  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = ai.getGenerativeModel({ model: CHAT_MODEL, generationConfig: { responseMimeType: "application/json" } });
  const prompt = `Você monta o briefing que um cliente vai enviar a arquitetos, a partir da conversa dele com o assistente do match.IA. Responda em português do Brasil, APENAS com um objeto JSON válido (sem markdown) com estas chaves de string, cada uma com no máximo 2 frases: resumo, objetivos, leituraDoEspaco (o que as fotos e a conversa mostram do local; se não houve fotos, escreva "Sem fotos enviadas."), estiloEMateriais, orcamento, prazo, restricoes, perguntasEmAberto (o que ainda precisa ser alinhado com o arquiteto), proximosPassos (o primeiro passo que o cliente espera combinar COM o arquiteto, escrito como o cliente; não fale do match.IA). Use SOMENTE o que está nos dados e na conversa; onde não houver informação escreva "Não informado." Não invente fatos, valores nem prazos.

Dados do projeto: ${projectContext(project, client)}
Fotos enviadas pelo cliente na conversa: ${photoCount}

Conversa:
${transcript}`;
  const result = await withTimeout(model.generateContent(prompt), CHAT_TIMEOUT_MS);
  return JSON.parse(result.response.text());
}
