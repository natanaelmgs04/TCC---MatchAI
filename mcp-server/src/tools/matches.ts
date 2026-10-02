import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerMatchTools(server: McpServer): void {
  server.registerTool(
    "matchia_run_match",
    {
      title: "Rodar match de IA para um projeto",
      description:
        "Roda o algoritmo de compatibilidade do match.IA para um projeto do cliente logado contra o portfólio " +
        "de todos os arquitetos cadastrados. Retorna os melhores resultados (results) e, quando existem, " +
        "grupos extras categorizados com o motivo (indisponível, fora da região, fora do orçamento, fora do " +
        "estilo mas bem avaliado) — nenhum resultado desaparece sem explicação. Limite de 30 buscas por hora " +
        "por usuário. Requer login como cliente.",
      inputSchema: { projectId: z.string().min(1).describe("ID de um projeto do cliente logado (ver matchia_list_my_projects)") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ projectId }) => {
      try {
        const data = await apiRequest("POST", "/matches/run", { body: { projectId }, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_get_match_history",
    {
      title: "Ver histórico de buscas de match",
      description: "Lista as últimas 20 execuções de match do cliente logado, mais recentes primeiro. Requer login como cliente.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/matches/history", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
