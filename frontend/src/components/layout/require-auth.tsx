"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { useSession } from "@/lib/auth/session";

/**
 * Guards every authenticated route (frontend-plan Phase 4 — protected routes,
 * session expiration):
 * - loading   → dashboard-shaped skeleton while GET /auth/me resolves
 * - unauthenticated (401/403) → redirect to /login with a return path
 * - error (backend unreachable) → render with an honest warning banner
 * - authenticated → children
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, pathname, router]);

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-label="Checking your session"
        className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
      >
        <PageSkeleton />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  if (status === "error") {
    return (
      <div className="space-y-6">
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <p>
            Cannot reach the API server — the dashboard is shown without live
            data. Check that the backend is running and{" "}
            <code className="rounded bg-muted px-1">NEXT_PUBLIC_API_BASE_URL</code>{" "}
            points at it.
          </p>
        </div>
        {children}
      </div>
    );
  }

  return <>{children}</>;
}
