import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

export function registerCaseStudyTools(server: McpServer): void {
  server.registerTool(
    "matchia_list_featured_case_studies",
    {
      title: "Listar cases de sucesso em destaque",
      description:
        "Lista os cases de sucesso publicados (aprovados por cliente e arquiteto) em toda a plataforma, " +
        "ordenados por compatibilidade. Vitrine pública. Não requer login.",
      inputSchema: { limit: z.number().int().min(1).max(24).default(12).describe("Máximo de cases a retornar (até 24)") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ limit }) => {
      try {
        const data = await apiRequest("GET", "/case-studies/featured", { query: { limit } });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_list_architect_case_studies",
    {
      title: "Listar cases de sucesso de um arquiteto",
      description: "Lista os cases de sucesso publicados de um arquiteto específico. Não requer login.",
      inputSchema: { architectId: z.string().min(1).describe("ID do arquiteto") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ architectId }) => {
      try {
        const data = await apiRequest("GET", `/case-studies/architect/${encodeURIComponent(architectId)}`);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_get_case_study",
    {
      title: "Ver case de sucesso de um projeto",
      description: "Retorna o case de sucesso (publicado ou em rascunho) do projeto entre o usuário logado e a outra parte. Requer login.",
      inputSchema: { otherId: z.string().min(1).describe("ID da outra parte (cliente ou arquiteto)") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ otherId }) => {
      try {
        const data = await apiRequest("GET", `/case-studies/${encodeURIComponent(otherId)}`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_propose_case_study",
    {
      title: "Propor case de sucesso",
      description:
        "O arquiteto logado propõe um case de sucesso pra um cliente cujo resumo de projeto já foi confirmado " +
        "dos dois lados. Fica pendente até o cliente aprovar. Requer login como arquiteto.",
      inputSchema: {
        otherId: z.string().min(1).describe("ID do cliente"),
        title: z.string().min(1).describe("Título do case"),
        description: z.string().optional().describe("Descrição do projeto"),
        images: z.array(z.string().url()).max(4).optional().describe("Até 4 URLs de imagem"),
        projectId: z.string().optional().describe("ID do projeto relacionado (usado pra derivar metragem/estilo/score)"),
        portfolioItemId: z.string().optional().describe("ID da peça de portfólio relacionada"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ otherId, ...body }) => {
      try {
        const data = await apiRequest("POST", `/case-studies/${encodeURIComponent(otherId)}`, { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_submit_case_study_testimonial",
    {
      title: "Adicionar testemunho ao case de sucesso",
      description: "O cliente logado adiciona um testemunho a um case de sucesso já proposto pelo arquiteto. Requer login como cliente.",
      inputSchema: {
        otherId: z.string().min(1).describe("ID do arquiteto"),
        testimonial: z.string().optional().describe("Texto do testemunho"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ otherId, ...body }) => {
      try {
        const data = await apiRequest("POST", `/case-studies/${encodeURIComponent(otherId)}/testimonial`, { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_approve_case_study",
    {
      title: "Aprovar case de sucesso",
      description:
        "O usuário logado aprova, do seu lado (cliente ou arquiteto), um case de sucesso proposto. Quando " +
        "ambos os lados aprovam, o case é publicado e a outra parte é notificada. Requer login.",
      inputSchema: { otherId: z.string().min(1).describe("ID da outra parte envolvida no case") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ otherId }) => {
      try {
        const data = await apiRequest("POST", `/case-studies/${encodeURIComponent(otherId)}/approve`, { auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
