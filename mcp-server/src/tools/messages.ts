import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerMessageTools(server: McpServer): void {
  server.registerTool(
    "matchia_send_message",
    {
      title: "Enviar mensagem",
      description: "Envia uma mensagem de texto para outro usuário (cliente ou arquiteto). Requer login.",
      inputSchema: {
        to: z.string().min(1).describe("ID do usuário destinatário"),
        text: z.string().min(1).describe("Texto da mensagem"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (body) => {
      try {
        const data = await apiRequest("POST", "/messages", { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_list_conversations",
    {
      title: "Listar conversas",
      description:
        "Lista as conversas do usuário logado, uma por pessoa com quem já trocou mensagem, com a última " +
        "mensagem e contagem de não lidas — mais recentes primeiro. Requer login.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/messages/conversations", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_get_unread_message_count",
    {
      title: "Contar mensagens não lidas",
      description: "Retorna quantas mensagens não lidas o usuário logado tem, somando todas as conversas. Requer login.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/messages/unread-count", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_get_conversation",
    {
      title: "Ver conversa com um usuário",
      description:
        "Retorna todas as mensagens trocadas entre o usuário logado e outro usuário, em ordem cronológica. " +
        "Como efeito colateral, marca como lidas as mensagens não lidas vindas dessa pessoa. Requer login.",
      inputSchema: { userId: z.string().min(1).describe("ID do outro usuário da conversa") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ userId }) => {
      try {
        const data = await apiRequest("GET", `/messages/${encodeURIComponent(userId)}`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
