import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerDashboardTools(server: McpServer): void {
  server.registerTool(
    "matchia_get_me",
    {
      title: "Ver meu perfil completo",
      description:
        "Retorna o documento completo do usuário logado, incluindo clientProfile, architectProfile ou " +
        "storeProfile conforme o papel. Requer login (matchia_login).",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/dashboard/me", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_update_me",
    {
      title: "Atualizar meu perfil",
      description:
        "Atualiza campos do usuário logado. Os objetos de perfil são mesclados de forma rasa sobre os " +
        "existentes (envie só os campos que quer mudar dentro deles). Requer login.",
      inputSchema: {
        name: z.string().optional().describe("Nome"),
        phone: z.string().optional().describe("Telefone"),
        city: z.string().optional().describe("Cidade"),
        state: z.string().optional().describe("Estado (UF)"),
        clientProfile: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Campos de clientProfile a mesclar (preferredStyles[], preferredMaterials[], budget:{min,max}, propertyType, familySize, projectGoals, preferences)",
          ),
        architectProfile: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Campos de architectProfile a mesclar (styles[], specialties[], yearsExperience, workingAreas[], priceRange:{min,max}, favoriteMaterials[] (máx. 5), bio, website, instagram, availability)",
          ),
        storeProfile: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Campos de storeProfile a mesclar (storeName, description, logoUrl, city, state, categories[])"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (body) => {
      try {
        const data = await apiRequest("PATCH", "/dashboard/me", { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_export_my_data",
    {
      title: "Exportar meus dados (LGPD)",
      description:
        "Exporta todos os dados pessoais guardados sobre o usuário logado (conta, projetos, mensagens, " +
        "histórico de buscas, avaliações, favoritos, etc.) em conformidade com a LGPD. Requer login.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/dashboard/me/export", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_delete_my_account",
    {
      title: "Excluir minha conta permanentemente",
      description:
        "AÇÃO IRREVERSÍVEL. Exclui a conta do usuário logado e faz uma exclusão em cascata de todos os dados " +
        "relacionados (projetos, mensagens, avaliações, histórico de match, validações, favoritos, timelines, " +
        "cases de sucesso e mais) — direito ao esquecimento da LGPD. Não existe desfazer. Por segurança, exige " +
        "o campo confirm=true; sem ele a ferramenta se recusa a chamar a API.",
      inputSchema: {
        confirm: z
          .literal(true)
          .describe("Deve ser exatamente `true` para confirmar que você entende que isso é permanente e irreversível"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ confirm }) => {
      if (confirm !== true) {
        return toolError(new Error("Exclusão cancelada: confirm precisa ser exatamente `true`."));
      }
      try {
        const data = await apiRequest("DELETE", "/dashboard/me", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_get_my_architect_stats",
    {
      title: "Ver minhas métricas de arquiteto",
      description:
        "Retorna as métricas de performance dos últimos 30 dias do arquiteto logado (visualizações de perfil, " +
        "aparições em resultados de match, validações confirmadas, conversas recebidas, taxa de resposta). " +
        "Requer login como arquiteto — recurso do plano Pro.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/dashboard/me/stats", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_add_portfolio_piece",
    {
      title: "Adicionar peça ao portfólio",
      description:
        "Adiciona uma peça ao portfólio do arquiteto logado — é o que alimenta o cálculo de compatibilidade " +
        "do match, não um perfil genérico. Plano Free permite até 3 peças (+ bônus de indicação); Pro é " +
        "ilimitado. Requer login como arquiteto.",
      inputSchema: {
        title: z.string().min(1).describe("Título da peça/projeto"),
        description: z.string().optional().describe("Descrição"),
        imageUrl: z.string().url().optional().describe("URL de imagem"),
        projectUrl: z.string().url().optional().describe("URL externa do projeto"),
        styles: z.array(z.string()).optional().describe("Estilos (ex.: ['Contemporâneo', 'Minimalista'])"),
        materials: z.array(z.string()).optional().describe("Materiais usados"),
        areaM2: z.number().positive().optional().describe("Metragem em m²"),
        status: z.enum(["ongoing", "completed"]).optional().describe("Status do projeto"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (body) => {
      try {
        const data = await apiRequest("POST", "/dashboard/portfolio", { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_update_portfolio_piece",
    {
      title: "Editar peça do portfólio",
      description: "Atualiza uma peça existente do portfólio do arquiteto logado. Requer login como arquiteto.",
      inputSchema: {
        id: z.string().min(1).describe("ID da peça (ou título/URL do projeto, que também servem como chave)"),
        title: z.string().optional(),
        description: z.string().optional(),
        imageUrl: z.string().url().optional(),
        projectUrl: z.string().url().optional(),
        styles: z.array(z.string()).optional(),
        materials: z.array(z.string()).optional(),
        areaM2: z.number().positive().optional(),
        status: z.enum(["ongoing", "completed"]).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ id, ...body }) => {
      try {
        const data = await apiRequest("PATCH", `/dashboard/portfolio/${encodeURIComponent(id)}`, { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_delete_portfolio_piece",
    {
      title: "Remover peça do portfólio",
      description: "Remove uma peça do portfólio do arquiteto logado. Requer login como arquiteto.",
      inputSchema: { id: z.string().min(1).describe("ID (ou título/URL) da peça a remover") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ id }) => {
      try {
        const data = await apiRequest("DELETE", `/dashboard/portfolio/${encodeURIComponent(id)}`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
