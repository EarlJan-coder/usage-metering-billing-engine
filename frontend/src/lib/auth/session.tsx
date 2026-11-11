"use client";

import { createContext, useContext, type ReactNode } from "react";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  /** Tenant role: "admin" unlocks Platform Admin navigation. */
  role: "admin" | "member";
};

export type SessionTenant = {
  id: string;
  name: string;
  plan?: string;
};

export type SessionValue = {
  status: SessionStatus;
  user: SessionUser | null;
  /** Workspace the user is currently operating in. */
  tenant: SessionTenant | null;
  tenants: SessionTenant[];
  signOut: () => void | Promise<void>;
};

/**
 * Placeholder session used before authentication is wired to the backend
 * (Phase 4 replaces the provider value with GET /auth/me data).
 */
export const GUEST_SESSION: SessionValue = {
  status: "unauthenticated",
  user: null,
  tenant: null,
  tenants: [],
  signOut: () => {},
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionValue;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
