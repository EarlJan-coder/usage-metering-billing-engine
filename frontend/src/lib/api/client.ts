/**
 * Centralized typed API client (ledger Ruling 2).
 *
 * - Base URL comes from NEXT_PUBLIC_API_BASE_URL (backend-plan §6 prefix
 *   `/api/v1`); requests always send cookies (`credentials: "include"`) and
 *   carry any in-memory bearer token — never browser storage (Ruling 3).
 * - Non-2xx responses become ApiError with the backend's error envelope
 *   message/code when present.
 * - 401 responses notify the registered handler so the session provider can
 *   expire an authenticated session (frontend-plan Phase 4).
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type ApiRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiRequestOptions = {
  method?: ApiRequestMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

/** Read at call time so tests can stub the env; Next inlines it at build. */
export function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
}

let bearerToken: string | null = null;

/** Keeps the token in memory only — no localStorage/sessionStorage (Ruling 3). */
export function setBearerToken(token: string | null): void {
  bearerToken = token;
}

export function getBearerToken(): string | null {
  return bearerToken;
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

async function toApiError(response: Response): Promise<ApiError> {
  const fallback = `Request failed with status ${response.status}`;
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      const envelope =
        record.error && typeof record.error === "object"
          ? (record.error as Record<string, unknown>)
          : record;
      const message =
        typeof envelope.message === "string"
          ? envelope.message
          : typeof record.message === "string"
            ? record.message
            : fallback;
      const code =
        typeof envelope.code === "string"
          ? envelope.code
          : typeof record.code === "string"
            ? record.code
            : undefined;
      return new ApiError(response.status, message, code);
    }
  } catch {
    // Non-JSON error body — fall through to the fallback message.
  }
  return new ApiError(response.status, fallback);
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, headers = {}, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the API server. Check that the backend is running and NEXT_PUBLIC_API_BASE_URL is set.",
      "network_error",
    );
  }

  if (response.status === 401) {
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      response.status,
      "The API returned a response the app could not parse.",
      "invalid_json",
    );
  }
}
