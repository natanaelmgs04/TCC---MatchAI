import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerCommissionTools(server: McpServer): void {
  server.registerTool(
    "matchia_get_my_commissions",
    {
      title: "Ver minhas comissões (arquiteto)",
      description:
        "Lista as comissões simuladas do arquiteto logado, registradas quando um projeto fecha pela " +
        "plataforma (validação confirmada dos dois lados) — projeto acadêmico, nenhuma cobrança real. " +
        "Requer login como arquiteto.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/commissions/mine", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
