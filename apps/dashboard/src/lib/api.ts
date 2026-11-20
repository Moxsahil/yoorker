/**
 * The Yoorker API, the only backend. In development Vite proxies /api to it (vite.config.ts), so
 * the session cookie stays same-origin; a deployed dashboard sets VITE_API_URL.
 */
const BASE = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

function messageOf(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const { message, issues } = body as {
      message?: unknown;
      issues?: { path: string; message: string }[];
    };
    if (Array.isArray(issues) && issues.length > 0)
      return issues.map((issue) => issue.message).join(" · ");
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(" · ");
  }
  return `Request failed (${status})`;
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, messageOf(body, response.status), body);
  return body as T;
}
