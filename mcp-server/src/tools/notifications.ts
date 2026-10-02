import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerNotificationTools(server: McpServer): void {
  server.registerTool(
    "matchia_list_notifications",
    {
      title: "Listar minhas notificações",
      description:
        "Lista as últimas 20 notificações do usuário logado (mensagem, avaliação, validação, CAU, indicação, " +
        "disponibilidade, timeline, case de sucesso, comissão, loja), mais recentes primeiro. Requer login.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/notifications", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_get_unread_notification_count",
    {
      title: "Contar notificações não lidas",
      description: "Retorna quantas notificações não lidas o usuário logado tem. Requer login.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/notifications/unread-count", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_mark_all_notifications_read",
    {
      title: "Marcar todas as notificações como lidas",
      description: "Marca todas as notificações não lidas do usuário logado como lidas. Requer login.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("POST", "/notifications/read-all", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
