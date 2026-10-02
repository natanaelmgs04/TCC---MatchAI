import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerBriefTools(server: McpServer): void {
  server.registerTool(
    "matchia_get_brief",
    {
      title: "Gerar briefing de projeto para um arquiteto",
      description:
        "Gera, por IA generativa (Gemini, com fallback determinístico), um briefing estruturado (resumo, " +
        "objetivos, estilo e materiais, orçamento, restrições, próximos passos) do projeto do cliente logado " +
        "voltado para um arquiteto específico. Limite de 15 chamadas a cada 10 minutos. Requer login como cliente.",
      inputSchema: { architectId: z.string().min(1).describe("ID do arquiteto alvo do briefing") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ architectId }) => {
      try {
        const data = await apiRequest("GET", `/briefs/${encodeURIComponent(architectId)}`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
