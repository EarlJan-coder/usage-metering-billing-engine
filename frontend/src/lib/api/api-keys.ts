import { apiFetch } from "./client";
import { asObject, pickArray, pickString } from "./normalize";

/**
 * API key endpoints (backend-plan §6: GET /api-keys, POST /api-keys,
 * DELETE /api-keys/:id).
 *
 * Keys are hashed server-side; the list only ever carries masked values.
 * The plaintext key exists in the response of POST /api-keys exactly once
 * (backend-plan §5I) — extractPlaintextKey never accepts a masked value.
 */

export type ApiKey = {
  id: string;
  name: string;
  /** Masked/prefixed representation for the table (never the secret). */
  maskedKey: string | null;
  /** Raw status string for StatusBadge tone mapping. */
  status: string;
  createdAt: string | null;
  lastUsedAt: string | null;
};

export type CreatedApiKey = {
  key: ApiKey;
  /** One-time plaintext secret, or null if the backend returned none. */
  plaintext: string | null;
};

const MASKED_PATTERN = /[•*]|_?\.{3,}/;

export function normalizeApiKey(payload: unknown): ApiKey | null {
  const record = asObject(payload);
  if (!record) return null;
  const id = pickString(record, "id", "keyId", "key_id");
  if (!id) return null;

  return {
    id,
    name: pickString(record, "name", "keyName", "key_name", "label") ?? "Unnamed key",
    maskedKey:
      pickString(record, "maskedKey", "masked_key", "prefix", "keyPrefix", "last4") ??
      null,
    status: pickString(record, "status") ?? "active",
    createdAt:
      pickString(record, "createdAt", "created_at", "created") ?? null,
    lastUsedAt:
      pickString(record, "lastUsedAt", "last_used_at", "lastUsed") ?? null,
  };
}

export function normalizeApiKeys(payload: unknown): ApiKey[] {
  const list = Array.isArray(payload)
    ? payload
    : pickArray(asObject(payload) ?? {}, "items", "keys", "data");
  if (!list) return [];
  const keys: ApiKey[] = [];
  for (const entry of list) {
    const key = normalizeApiKey(entry);
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * Reads the one-time plaintext secret from a create response. Masked values
 * (bullets/ellipsis) are rejected so a table prefix can never be mistaken
 * for the real key.
 */
export function extractPlaintextKey(payload: unknown): string | null {
  const root = asObject(payload);
  if (!root) return null;
  const nested = asObject(root.data);
  const candidates = [
    root.key,
    root.secret,
    root.plaintext,
    root.apiKey,
    root.api_key,
    nested?.key,
    nested?.secret,
    nested?.apiKey,
  ];
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim().length >= 8 &&
      !MASKED_PATTERN.test(candidate)
    ) {
      return candidate.trim();
    }
  }
  return null;
}

export const apiKeysApi = {
  async list(): Promise<ApiKey[]> {
    const payload = await apiFetch<unknown>("/api-keys");
    return normalizeApiKeys(payload);
  },

  async create(input: { name: string }): Promise<CreatedApiKey> {
    const payload = await apiFetch<unknown>("/api-keys", {
      method: "POST",
      body: input,
    });
    return {
      key: normalizeApiKey(payload) ?? {
        id: "",
        name: input.name,
        maskedKey: null,
        status: "active",
        createdAt: null,
        lastUsedAt: null,
      },
      plaintext: extractPlaintextKey(payload),
    };
  },

  async revoke(id: string): Promise<void> {
    await apiFetch<void>(`/api-keys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};
