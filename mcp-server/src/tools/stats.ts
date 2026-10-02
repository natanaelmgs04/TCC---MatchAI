import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerStatsTools(server: McpServer): void {
  server.registerTool(
    "matchia_get_public_stats",
    {
      title: "Ver estatísticas públicas da plataforma",
      description:
        "Retorna números públicos do match.IA: total de arquitetos, total de clientes, compatibilidade média " +
        "de todos os matches já rodados, e total de matches executados. Não requer login.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/stats");
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
