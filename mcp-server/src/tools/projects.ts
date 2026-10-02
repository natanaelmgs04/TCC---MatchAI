import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    "matchia_list_my_projects",
    {
      title: "Listar meus projetos",
      description:
        "Lista os projetos do cliente logado. O match é rodado a partir de um projeto específico, não de um " +
        "perfil único — um cliente pode ter vários. Requer login como cliente.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/projects", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_create_project",
    {
      title: "Criar projeto",
      description: "Cria um novo projeto para o cliente logado. Requer login como cliente.",
      inputSchema: {
        name: z.string().min(1).describe("Nome do projeto"),
        preferredStyles: z.array(z.string()).optional().describe("Estilos preferidos"),
        preferredMaterials: z.array(z.string()).optional().describe("Materiais preferidos"),
        budgetMin: z.number().nonnegative().optional().describe("Orçamento mínimo (R$)"),
        budgetMax: z.number().nonnegative().optional().describe("Orçamento máximo (R$)"),
        propertyType: z.string().optional().describe("Tipo de imóvel (ex.: 'Casa', 'Apartamento')"),
        familySize: z.number().int().positive().optional().describe("Composição familiar (nº de pessoas)"),
        projectGoals: z.string().optional().describe("Objetivos do projeto, em texto livre"),
        preferences: z.string().optional().describe("Outras preferências, em texto livre"),
        areaM2: z.number().positive().optional().describe("Metragem em m²"),
        status: z.enum(["draft", "matching", "in_progress", "completed"]).optional().describe("Status inicial"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (body) => {
      try {
        const data = await apiRequest("POST", "/projects", { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_update_project",
    {
      title: "Editar projeto",
      description: "Atualiza campos de um projeto existente do cliente logado. Requer login como cliente.",
      inputSchema: {
        id: z.string().min(1).describe("ID do projeto"),
        name: z.string().optional(),
        propertyType: z.string().optional(),
        projectGoals: z.string().optional(),
        preferences: z.string().optional(),
        status: z.enum(["draft", "matching", "in_progress", "completed"]).optional(),
        familySize: z.number().int().positive().optional(),
        areaM2: z.number().positive().optional(),
        preferredStyles: z.array(z.string()).optional(),
        preferredMaterials: z.array(z.string()).optional(),
        budgetMin: z.number().nonnegative().optional(),
        budgetMax: z.number().nonnegative().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ id, ...body }) => {
      try {
        const data = await apiRequest("PATCH", `/projects/${encodeURIComponent(id)}`, { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_delete_project",
    {
      title: "Excluir projeto",
      description: "Exclui permanentemente um projeto do cliente logado. Requer login como cliente.",
      inputSchema: { id: z.string().min(1).describe("ID do projeto a excluir") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ id }) => {
      try {
        const data = await apiRequest("DELETE", `/projects/${encodeURIComponent(id)}`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_get_suggested_products",
    {
      title: "Ver produtos sugeridos para um projeto",
      description:
        "Retorna até 5 produtos de lojas parceiras sugeridos por IA para um projeto (palavras-chave extraídas " +
        "dos objetivos do projeto via Gemini, casadas contra o catálogo de produtos das lojas). Requer login " +
        "como cliente, dono do projeto.",
      inputSchema: { id: z.string().min(1).describe("ID do projeto") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ id }) => {
      try {
        const data = await apiRequest("GET", `/projects/${encodeURIComponent(id)}/suggested-products`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
