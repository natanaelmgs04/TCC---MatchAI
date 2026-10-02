import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerFavoriteTools(server: McpServer): void {
  server.registerTool(
    "matchia_list_favorites",
    {
      title: "Listar arquitetos favoritados",
      description:
        "Lista os arquitetos que o cliente logado salvou como favorito — de qualquer categoria de match, " +
        "mesmo os que não deram certo agora (indisponível, fora da região ou do orçamento). Requer login como cliente.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/favorites", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_add_favorite",
    {
      title: "Favoritar arquiteto",
      description: "Adiciona um arquiteto aos favoritos do cliente logado. Idempotente — favoritar de novo não duplica. Requer login como cliente.",
      inputSchema: { architectId: z.string().min(1).describe("ID do arquiteto a favoritar") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ architectId }) => {
      try {
        const data = await apiRequest("POST", `/favorites/${encodeURIComponent(architectId)}`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_remove_favorite",
    {
      title: "Desfavoritar arquiteto",
      description: "Remove um arquiteto dos favoritos do cliente logado. Sem erro se ele não estava favoritado. Requer login como cliente.",
      inputSchema: { architectId: z.string().min(1).describe("ID do arquiteto a remover dos favoritos") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ architectId }) => {
      try {
        const data = await apiRequest("DELETE", `/favorites/${encodeURIComponent(architectId)}`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
