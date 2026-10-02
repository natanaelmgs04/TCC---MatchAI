import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, setAuthToken, toolError, toolResult } from "../apiClient.js";

interface AuthResponse {
  token: string;
  user: { id: string; name: string; role: "client" | "architect" | "store" };
}

export function registerAuthTools(server: McpServer): void {
  server.registerTool(
    "matchia_register",
    {
      title: "Criar conta no match.IA",
      description:
        "Cria uma nova conta (cliente, arquiteto ou loja parceira) no match.IA e faz login automaticamente — " +
        "o token retornado fica guardado em memória para as próximas chamadas de ferramentas autenticadas " +
        "nesta mesma sessão do servidor MCP, sem precisar de uma chamada separada a matchia_login.",
      inputSchema: {
        role: z.enum(["client", "architect", "store"]).describe("Papel da conta: cliente, arquiteto ou loja parceira"),
        name: z.string().min(1).describe("Nome completo (ou nome da loja, se role=store)"),
        email: z.string().email().describe("E-mail, único por conta"),
        password: z.string().min(1).describe("Senha"),
        confirmPassword: z.string().min(1).describe("Confirmação da senha (deve ser igual a password)"),
        avatarUrl: z.string().url().optional().describe("URL de uma foto de perfil"),
        bio: z.string().optional().describe("Biografia curta"),
        storeName: z.string().optional().describe("Nome comercial da loja — usado só quando role=store"),
        referredBy: z
          .string()
          .optional()
          .describe("ID de usuário de quem indicou esta conta (dá bônus a ambos os lados)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const { role, ...body } = params;
        const data = await apiRequest<AuthResponse>("POST", `/auth/register/${role}`, { body });
        setAuthToken(data.token);
        return toolResult({ loggedInAs: data.user, message: "Conta criada e login efetuado." });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_login",
    {
      title: "Entrar no match.IA",
      description:
        "Autentica com e-mail e senha e guarda o token em memória para as próximas chamadas de ferramentas " +
        "autenticadas nesta sessão do servidor MCP (ex.: matchia_get_me, matchia_run_match).",
      inputSchema: {
        email: z.string().email().describe("E-mail da conta"),
        password: z.string().min(1).describe("Senha"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ email, password }) => {
      try {
        const data = await apiRequest<AuthResponse>("POST", "/auth/login", { body: { email, password } });
        setAuthToken(data.token);
        return toolResult({ loggedInAs: data.user });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "matchia_logout",
    {
      title: "Sair do match.IA",
      description: "Descarta o token guardado em memória. Chamadas autenticadas seguintes vão pedir login de novo.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      setAuthToken(null);
      return toolResult({ ok: true, message: "Sessão encerrada." });
    },
  );
}
