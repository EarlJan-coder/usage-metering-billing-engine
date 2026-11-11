import type { ReactNode } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";

/**
 * Centered chrome for sign-in, sign-up, and password recovery
 * (frontend-plan §6B).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
        >
          <Activity className="size-4.5" />
        </span>
        <span className="text-base font-semibold tracking-tight">
          Usage Metering
        </span>
      </Link>

      <div className="w-full max-w-sm">{children}</div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Link
          href="/"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
