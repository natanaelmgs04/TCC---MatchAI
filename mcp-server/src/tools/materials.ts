import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerMaterialTools(server: McpServer): void {
  server.registerTool(
    "matchia_list_materials",
    {
      title: "Listar banco de materiais",
      description:
        "Retorna o catálogo completo de materiais arquitetônicos do match.IA (nome, categoria, descrição, " +
        "foto real do Unsplash com atribuição de fotógrafo) — usado tanto como referência de projeto quanto " +
        "no cálculo de compatibilidade. Não é paginado, público.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/materials");
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
