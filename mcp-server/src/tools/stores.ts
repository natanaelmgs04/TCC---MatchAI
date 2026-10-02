import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerStoreTools(server: McpServer): void {
  server.registerTool(
    "matchia_get_store_profile",
    {
      title: "Ver perfil público de uma loja",
      description: "Retorna o perfil público de uma loja parceira (nome, descrição, cidade, categorias). Não requer login.",
      inputSchema: { id: z.string().min(1).describe("ID da loja") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ id }) => {
      try {
        const data = await apiRequest("GET", `/stores/${encodeURIComponent(id)}`);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_list_my_store_products",
    {
      title: "Listar meus produtos (loja)",
      description: "Lista os produtos cadastrados pela loja parceira logada. Requer login como loja.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/stores/me/products", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_create_store_product",
    {
      title: "Cadastrar produto (loja)",
      description:
        "Cadastra um produto no catálogo da loja parceira logada — a IA sugere produtos aos clientes durante " +
        "o desenvolvimento do projeto quando o estilo/categoria combina. Cadastro sempre manual, nunca por " +
        "scraping. Requer login como loja.",
      inputSchema: {
        name: z.string().min(1).describe("Nome do produto"),
        photo: z.string().url().optional().describe("URL da foto"),
        category: z.string().optional().describe("Categoria"),
        styles: z.array(z.string()).optional().describe("Estilos com que o produto combina"),
        price: z.number().nonnegative().optional().describe("Preço em R$"),
        purchaseUrl: z.string().url().optional().describe("URL de compra"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (body) => {
      try {
        const data = await apiRequest("POST", "/stores/me/products", { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_update_store_product",
    {
      title: "Editar produto (loja)",
      description: "Atualiza um produto existente da loja parceira logada. Requer login como loja.",
      inputSchema: {
        id: z.string().min(1).describe("ID do produto"),
        name: z.string().optional(),
        photo: z.string().url().optional(),
        category: z.string().optional(),
        purchaseUrl: z.string().url().optional(),
        styles: z.array(z.string()).optional(),
        price: z.number().nonnegative().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ id, ...body }) => {
      try {
        const data = await apiRequest("PATCH", `/stores/me/products/${encodeURIComponent(id)}`, { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_delete_store_product",
    {
      title: "Remover produto (loja)",
      description: "Remove permanentemente um produto do catálogo da loja parceira logada. Requer login como loja.",
      inputSchema: { id: z.string().min(1).describe("ID do produto a remover") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ id }) => {
      try {
        const data = await apiRequest("DELETE", `/stores/me/products/${encodeURIComponent(id)}`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_list_my_store_referrals",
    {
      title: "Listar minhas indicações (loja)",
      description:
        "Lista as indicações simuladas recebidas pela loja parceira logada, com valor total simulado — " +
        "projeto acadêmico, nenhuma cobrança real acontece. Requer login como loja.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/stores/me/referrals", { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_create_store_referral",
    {
      title: "Simular compra de produto",
      description:
        "O cliente logado confirma explicitamente uma 'simulação de compra' de um produto sugerido pela IA — " +
        "nunca rastreamento passivo. Registra uma indicação simulada para a loja (comissão de 10%, projeto " +
        "acadêmico, nenhuma cobrança real). Requer login como cliente.",
      inputSchema: {
        productId: z.string().min(1).describe("ID do produto"),
        projectId: z.string().optional().describe("ID do projeto relacionado, se aplicável"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (body) => {
      try {
        const data = await apiRequest("POST", "/stores/referrals", { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
