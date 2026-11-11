import { Loader2 } from "lucide-react";

/** Suspense fallback while an auth form resolves its search params. */
export function AuthFormFallback() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Loading…
      <span className="sr-only">Loading the form</span>
    </div>
  );
}
