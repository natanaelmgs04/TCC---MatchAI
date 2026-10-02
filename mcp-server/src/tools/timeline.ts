import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerTimelineTools(server: McpServer): void {
  server.registerTool(
    "matchia_get_timeline",
    {
      title: "Ver fase do projeto",
      description:
        "Retorna a fase atual (0-4: Contato inicial, Briefing, Conceito, Desenvolvimento, Entrega) do projeto " +
        "compartilhado entre o usuário logado e a outra parte. Requer login.",
      inputSchema: { otherId: z.string().min(1).describe("ID da outra parte (cliente ou arquiteto)") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ otherId }) => {
      try {
        const data = await apiRequest("GET", `/timeline/${encodeURIComponent(otherId)}`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_advance_timeline",
    {
      title: "Avançar fase do projeto",
      description:
        "Avança em uma etapa a fase do projeto compartilhado com a outra parte (até o máximo de 'Entrega'), " +
        "e a notifica da mudança. Requer login.",
      inputSchema: { otherId: z.string().min(1).describe("ID da outra parte (cliente ou arquiteto)") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ otherId }) => {
      try {
        const data = await apiRequest("POST", `/timeline/${encodeURIComponent(otherId)}/advance`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
