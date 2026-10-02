import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolError, toolResult } from "../apiClient.js";

const moodboardInputShape = {
  styles: z.array(z.string()).optional().describe("Estilos desejados"),
  materials: z.array(z.string()).optional().describe("Materiais desejados"),
  keywords: z.array(z.string()).optional().describe("Palavras-chave (ex.: 'luz natural', 'integração')"),
};

export function registerMoodboardTools(server: McpServer): void {
  server.registerTool(
    "matchia_generate_moodboard",
    {
      title: "Gerar moodboard conceitual",
      description:
        "Gera um conceito textual de moodboard por IA generativa (Gemini, com resposta padrão determinística " +
        "se a chave de API não estiver configurada) a partir de estilos, materiais e palavras-chave. Limite de " +
        "30 chamadas por hora por usuário. Requer login.",
      inputSchema: { ...moodboardInputShape, colorTones: z.array(z.string()).optional().describe("Tons de cor desejados") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (body) => {
      try {
        const data = await apiRequest("POST", "/moodboard", { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_generate_reference_image",
    {
      title: "Gerar referência visual (logado)",
      description:
        "Busca uma foto real (Unsplash, com atribuição) que ilustra o estilo/materiais/palavras-chave " +
        "informados. Limite de 30 chamadas por hora por usuário. Requer login.",
      inputSchema: moodboardInputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (body) => {
      try {
        const data = await apiRequest("POST", "/moodboard/reference-image", { body, auth: true });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_preview_reference_image",
    {
      title: "Prévia pública de referência visual",
      description:
        "Mesma busca de referência visual do Unsplash, mas sem exigir login — pensada para pré-visualização " +
        "antes do cadastro. Limite de 20 chamadas por hora por IP.",
      inputSchema: moodboardInputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (body) => {
      try {
        const data = await apiRequest("POST", "/moodboard/preview", { body });
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
