/**
 * Thin HTTP client for the match.IA Express API (backend/src/server.js).
 * Every MCP tool goes through here instead of talking to MongoDB directly,
 * so validation, scoring, rate limits and side effects (emails, notifications,
 * cascading deletes) all stay defined in one place: the real backend.
 */

export class MatchiaApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "MatchiaApiError";
    this.status = status;
  }
}

// Held in memory for the lifetime of this MCP server process, set by
// matchia_login / matchia_register and cleared by matchia_logout. An
// optional MATCHIA_TOKEN env var can pre-seed it for non-interactive setups.
let authToken: string | null = process.env.MATCHIA_TOKEN ?? null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function isAuthenticated(): boolean {
  return authToken !== null;
}

function getBaseUrl(): string {
  return (process.env.MATCHIA_BASE_URL ?? "http://localhost:3000/api").replace(/\/+$/, "");
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  /** Query string params; undefined values are omitted. */
  query?: Record<string, QueryValue>;
  /** JSON body, sent as-is. */
  body?: unknown;
  /**
   * Whether this call requires a logged-in user. When true and no token is
   * held, the request is rejected locally with a message telling the agent
   * exactly which tool to call first — no network round trip wasted on a
   * 401 we already know is coming.
   */
  auth?: boolean;
}

/**
 * Makes a request against the match.IA API. Throws MatchiaApiError with the
 * backend's own {error: "..."} message (already user-facing Portuguese
 * strings) on non-2xx responses, or a distinct actionable message when the
 * backend can't be reached at all (most commonly: it isn't running).
 */
export async function apiRequest<T = unknown>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { query, body, auth = false } = options;

  if (auth && !authToken) {
    throw new MatchiaApiError(
      401,
      "Não autenticado. Chame matchia_login (ou matchia_register, se ainda não tiver conta) antes de usar esta ferramenta.",
    );
  }

  const url = new URL(getBaseUrl() + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth && authToken) headers.Authorization = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new MatchiaApiError(
      0,
      `Não foi possível conectar à API do match.IA em ${getBaseUrl()}. Confirme que o backend está rodando ` +
        "(`npm run dev` na raiz do projeto, com MongoDB ativo) e que MATCHIA_BASE_URL aponta pro endereço certo.",
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => undefined)
    : undefined;

  if (!response.ok) {
    const backendMessage =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : undefined;
    throw new MatchiaApiError(response.status, backendMessage ?? `Erro inesperado (HTTP ${response.status}).`);
  }

  return data as T;
}

export interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Successful tool result: JSON text plus, when the shape is a plain object, structuredContent. */
export function toolResult(data: unknown): ToolTextResult {
  const structured =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

/** Failed tool result. Always returns MatchiaApiError messages verbatim — they're already actionable. */
export function toolError(error: unknown): ToolTextResult {
  const message =
    error instanceof MatchiaApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  return { content: [{ type: "text", text: `Erro: ${message}` }], isError: true };
}
