"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { ApiError, setUnauthorizedHandler } from "@/lib/api/client";
import { authApi, normalizeAuthPayload } from "@/lib/api/auth";

export type SessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

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
  /** Re-reads the session from GET /auth/me; returns the resulting status. */
  refresh: () => Promise<SessionStatus>;
};

/**
 * Placeholder session used where no provider is mounted (tests, stories).
 * The mounted provider fetches GET /auth/me itself (frontend-plan Phase 4).
 */
export const GUEST_SESSION: SessionValue = {
  status: "unauthenticated",
  user: null,
  tenant: null,
  tenants: [],
  signOut: () => {},
  refresh: async () => "unauthenticated",
};

type InternalState = {
  status: SessionStatus;
  user: SessionUser | null;
  tenant: SessionTenant | null;
  tenants: SessionTenant[];
};

const UNAUTHENTICATED: InternalState = {
  status: "unauthenticated",
  user: null,
  tenant: null,
  tenants: [],
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  /** When provided (tests/SSR placeholder), no network session is loaded. */
  value?: SessionValue;
  children: ReactNode;
}) {
  const [internal, setInternal] = useState<InternalState>({
    status: "loading",
    user: null,
    tenant: null,
    tenants: [],
  });
  const statusRef = useRef<SessionStatus>("loading");
  const signingOutRef = useRef(false);

  useEffect(() => {
    statusRef.current = internal.status;
  }, [internal.status]);

  const refresh = useCallback(async (): Promise<SessionStatus> => {
    try {
      const payload = await authApi.me();
      const { user, tenant } = normalizeAuthPayload(payload);
      if (user) {
        setInternal({
          status: "authenticated",
          user,
          tenant,
          tenants: tenant ? [tenant] : [],
        });
        return "authenticated";
      }
      setInternal(UNAUTHENTICATED);
      return "unauthenticated";
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        setInternal(UNAUTHENTICATED);
        return "unauthenticated";
      }
      // Network failure or 5xx: degrade gracefully instead of forcing login.
      setInternal((prev) => ({ ...prev, status: "error" }));
      return "error";
    }
  }, []);

  const signOut = useCallback(async () => {
    signingOutRef.current = true;
    try {
      await authApi.logout();
    } catch {
      // Backend unreachable — local state is cleared regardless.
    } finally {
      signingOutRef.current = false;
      setInternal(UNAUTHENTICATED);
    }
  }, []);

  useEffect(() => {
    if (value) return;

    setUnauthorizedHandler(() => {
      if (signingOutRef.current) return;
      if (statusRef.current === "authenticated") {
        setInternal(UNAUTHENTICATED);
        toast.error("Your session has expired. Please sign in again.");
      } else {
        setInternal((prev) =>
          prev.status === "loading" ? prev : { ...prev, status: "unauthenticated" },
        );
      }
    });

    // Kick off the session fetch. All setInternal calls inside refresh()
    // happen after `await`, so there is no synchronous cascading render —
    // the rule cannot see through the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time data fetch
    void refresh();

    return () => setUnauthorizedHandler(null);
  }, [value, refresh]);

  const contextValue: SessionValue = value ?? {
    ...internal,
    signOut,
    refresh,
  };

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
