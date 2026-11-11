import {
  apiFetch,
  setBearerToken,
} from "./client";

/**
 * Authentication endpoints (backend-plan §6 contract).
 *
 * The backend plan does not specify response body shapes, so payloads are
 * normalized tolerantly (see normalizeAuthPayload) instead of assuming one
 * exact envelope. Token capture supports both cookie sessions (no token in
 * the body) and JWT-in-body responses; the token stays in memory only.
 */

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
};

export type ApiTenant = {
  id: string;
  name: string;
  plan?: string;
};

export type AuthPayload = {
  user: ApiUser | null;
  tenant: ApiTenant | null;
};

export type LoginInput = { email: string; password: string };

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeUser(raw: Record<string, unknown>): ApiUser | null {
  const id = asNonEmptyString(raw.id) ?? asNonEmptyString(raw.userId);
  const email = asNonEmptyString(raw.email);
  if (!id && !email) return null;

  const localPart = email ? email.split("@")[0] : null;
  const name =
    asNonEmptyString(raw.name) ??
    asNonEmptyString(raw.fullName) ??
    localPart ??
    "User";

  return {
    id: id ?? "",
    name,
    email: email ?? "",
    role: raw.role === "admin" ? "admin" : "member",
  };
}

function normalizeTenant(
  source: Record<string, unknown> | null,
): ApiTenant | null {
  if (!source) return null;
  const id = asNonEmptyString(source.id) ?? asNonEmptyString(source.tenantId);
  if (!id) return null;
  const plan = asNonEmptyString(source.plan);
  return {
    id,
    name: asNonEmptyString(source.name) ?? "Workspace",
    ...(plan ? { plan } : {}),
  };
}

/**
 * Extracts the session user/tenant from an auth response, tolerating both a
 * wrapped shape (`{ user, tenant }` / `{ data: { user } }`) and a flat user
 * object at the top level. Anything without an id or email yields no session.
 */
export function normalizeAuthPayload(payload: unknown): AuthPayload {
  const root = asObject(payload);
  if (!root) return { user: null, tenant: null };

  const nested = asObject(root.data);
  const wrappedUser =
    asObject(root.user) ?? (nested ? asObject(nested.user) : null);
  const user = normalizeUser(wrappedUser ?? root);

  const tenantSource =
    asObject(root.tenant) ??
    (nested ? asObject(nested.tenant) : null) ??
    (asNonEmptyString(root.tenantId)
      ? { tenantId: root.tenantId }
      : null) ??
    (asNonEmptyString(root.tenant_id)
      ? { tenantId: root.tenant_id }
      : null);
  const tenant = normalizeTenant(tenantSource);

  return { user, tenant };
}

/** Reads a JWT from common response field names, if the backend returns one. */
export function extractToken(payload: unknown): string | null {
  const root = asObject(payload);
  if (!root) return null;
  const nested = asObject(root.data);
  return (
    asNonEmptyString(root.token) ??
    asNonEmptyString(root.accessToken) ??
    asNonEmptyString(root.access_token) ??
    (nested
      ? (asNonEmptyString(nested.token) ??
        asNonEmptyString(nested.accessToken))
      : null)
  );
}

function captureToken(payload: unknown): void {
  setBearerToken(extractToken(payload));
}

export const authApi = {
  async register(input: RegisterInput): Promise<unknown> {
    const payload = await apiFetch<unknown>("/auth/register", {
      method: "POST",
      body: input,
    });
    captureToken(payload);
    return payload;
  },

  async login(input: LoginInput): Promise<unknown> {
    const payload = await apiFetch<unknown>("/auth/login", {
      method: "POST",
      body: input,
    });
    captureToken(payload);
    return payload;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch<void>("/auth/logout", { method: "POST" });
    } finally {
      setBearerToken(null);
    }
  },

  async me(): Promise<unknown> {
    const payload = await apiFetch<unknown>("/auth/me");
    captureToken(payload);
    return payload;
  },

  async forgotPassword(input: { email: string }): Promise<unknown> {
    return apiFetch<unknown>("/auth/forgot-password", {
      method: "POST",
      body: input,
    });
  },
};
