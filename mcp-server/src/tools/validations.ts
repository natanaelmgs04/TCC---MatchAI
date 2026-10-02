import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerValidationTools(server: McpServer): void {
  server.registerTool(
    "matchia_get_validation_status",
    {
      title: "Ver status de validação do resumo do projeto",
      description:
        "Retorna se o cliente e o arquiteto já confirmaram, cada um do seu lado, o resumo do projeto gerado " +
        "após o match. Requer login (cliente ou arquiteto envolvido).",
      inputSchema: { otherId: z.string().min(1).describe("ID da outra parte (cliente, se você é arquiteto; arquiteto, se você é cliente)") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ otherId }) => {
      try {
        const data = await apiRequest("GET", `/validations/${encodeURIComponent(otherId)}`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_confirm_validation",
    {
      title: "Confirmar resumo do projeto",
      description:
        "Confirma, do lado do usuário logado, que o resumo do projeto está correto. Quando os dois lados " +
        "confirmam, uma comissão simulada é registrada e o arquiteto ganha um projeto fechado no histórico. " +
        "Requer login.",
      inputSchema: { otherId: z.string().min(1).describe("ID da outra parte envolvida na validação") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ otherId }) => {
      try {
        const data = await apiRequest("POST", `/validations/${encodeURIComponent(otherId)}/confirm`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_list_pending_validations",
    {
      title: "Listar validações pendentes (arquiteto)",
      description:
        "Lista clientes que já confirmaram o resumo do projeto do lado deles e esperam a confirmação do " +
        "arquiteto logado. Requer login como arquiteto.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/validations/pending", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_list_confirmed_validations",
    {
      title: "Listar validações confirmadas (arquiteto)",
      description:
        "Lista clientes cujo resumo do projeto já foi confirmado dos dois lados — pré-requisito para propor " +
        "um case de sucesso. Requer login como arquiteto.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/validations/confirmed", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
