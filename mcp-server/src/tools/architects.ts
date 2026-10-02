import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerArchitectTools(server: McpServer): void {
  server.registerTool(
    "matchia_list_architects",
    {
      title: "Listar arquitetos",
      description:
        "Busca arquitetos cadastrados no match.IA, ordenados por mérito (nota média, projetos fechados e bônus " +
        "Pro) — não é um ranking pago: um arquiteto Free com mérito real pode superar um Pro fraco. Suporta " +
        "filtro por estilo, cidade, experiência mínima e nota mínima, com paginação.",
      inputSchema: {
        style: z.string().optional().describe("Filtra por estilo arquitetônico (ex.: 'Contemporâneo')"),
        city: z.string().optional().describe("Filtra por cidade (busca parcial, sem diferenciar maiúsculas)"),
        minExperience: z.number().int().min(0).optional().describe("Anos mínimos de experiência"),
        minRating: z.number().min(0).max(5).optional().describe("Nota média mínima (0-5)"),
        page: z.number().int().min(1).default(1).describe("Página de resultados (começa em 1)"),
        pageSize: z.number().int().min(1).max(50).default(9).describe("Itens por página (máx. 50)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const data = await apiRequest("GET", "/architects", { query: params });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_get_architect",
    {
      title: "Ver perfil de um arquiteto",
      description: "Retorna o perfil público de um arquiteto pelo ID (nome, cidade, especialidade, portfólio etc.).",
      inputSchema: { id: z.string().min(1).describe("ID do arquiteto (User._id)") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ id }) => {
      try {
        const data = await apiRequest("GET", `/architects/${encodeURIComponent(id)}`);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_get_architect_reference_image",
    {
      title: "Referência visual do estilo de um arquiteto",
      description:
        "Retorna uma foto real (via Unsplash, com atribuição de fotógrafo) que ilustra o estilo do arquiteto, " +
        "gerada a partir do perfil de estilo/materiais dele e cacheada após a primeira chamada.",
      inputSchema: { id: z.string().min(1).describe("ID do arquiteto") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ id }) => {
      try {
        const data = await apiRequest("GET", `/architects/${encodeURIComponent(id)}/reference-image`);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_record_architect_view",
    {
      title: "Registrar visita a um perfil de arquiteto",
      description:
        "Registra uma visualização anônima do perfil de um arquiteto (usada nas métricas Pro dele: " +
        "views30d, taxa de resposta etc.). Não requer login — visitas anônimas contam.",
      inputSchema: { id: z.string().min(1).describe("ID do arquiteto visitado") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ id }) => {
      try {
        await apiRequest("POST", `/architects/${encodeURIComponent(id)}/view`);
        return toolResult({ ok: true });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_set_subscription_tier",
    {
      title: "Definir plano do arquiteto (Free/Pro)",
      description:
        "Simula a troca do plano de assinatura do arquiteto logado entre Free e Pro (projeto acadêmico — " +
        "sem gateway de pagamento real, nenhuma cobrança acontece). Pro dá um bônus de ranking, nunca um topo " +
        "garantido. Requer login como arquiteto (matchia_login).",
      inputSchema: { tier: z.enum(["free", "pro"]).describe("Plano desejado") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ tier }) => {
      try {
        const data = await apiRequest("POST", "/architects/me/subscription", { body: { tier }, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
