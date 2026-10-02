import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerReviewTools(server: McpServer): void {
  server.registerTool(
    "matchia_create_review",
    {
      title: "Avaliar um arquiteto",
      description:
        "Cria (ou substitui, se já existir uma anterior do mesmo cliente para o mesmo arquiteto) uma avaliação " +
        "com nota de 1 a 5 e comentário opcional. Requer login como cliente.",
      inputSchema: {
        architect: z.string().min(1).describe("ID do arquiteto avaliado"),
        rating: z.number().int().min(1).max(5).describe("Nota de 1 a 5"),
        comment: z.string().optional().describe("Comentário opcional"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (body) => {
      try {
        const data = await apiRequest("POST", "/reviews", { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_get_reviews_for_architect",
    {
      title: "Ver avaliações de um arquiteto",
      description: "Lista as avaliações públicas de um arquiteto, com a média e a contagem total. Não requer login.",
      inputSchema: { architectId: z.string().min(1).describe("ID do arquiteto") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ architectId }) => {
      try {
        const data = await apiRequest("GET", `/reviews/${encodeURIComponent(architectId)}`);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
