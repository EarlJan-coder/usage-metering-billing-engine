"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { ApiKeyRevealDialog } from "@/components/api-keys/api-key-reveal-dialog";
import { ApiKeyTable } from "@/components/api-keys/api-key-table";
import { CreateApiKeyDialog } from "@/components/api-keys/create-api-key-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiKeysApi, type ApiKey } from "@/lib/api/api-keys";
import { ApiError, getBaseUrl } from "@/lib/api/client";

function integrationExample(): string {
  const baseUrl = getBaseUrl() || "http://localhost:4000/api/v1";
  return `curl -X POST ${baseUrl}/metering/track \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Idempotency-Key: unique-request-id" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"api_call","quantity":1}'`;
}

/**
 * API key management (frontend-plan §6F + Phase 7): list with status and
 * dates, one-time reveal after creation, revocation, and a developer
 * integration example pinned to the backend contract (POST /metering/track).
 */
export function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [revealed, setRevealed] = useState<{
    plaintext: string;
    name: string;
  } | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKey | null>(null);
  const [copiedExample, setCopiedExample] = useState(false);

  const list = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiKeysApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiKeysApi.create({ name }),
    onSuccess: (created) => {
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      if (created.plaintext) {
        setRevealed({ plaintext: created.plaintext, name: created.key.name });
      } else {
        toast.success(
          "Key created, but the backend returned no one-time secret.",
        );
      }
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => {
      setPendingRevoke(null);
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked");
    },
    onError: (error) => {
      setPendingRevoke(null);
      toast.error(
        error instanceof ApiError
          ? error.message
          : "The key could not be revoked.",
      );
    },
  });

  async function handleCopyExample() {
    try {
      await navigator.clipboard.writeText(integrationExample());
      setCopiedExample(true);
      toast.success("Integration example copied");
      setTimeout(() => setCopiedExample(false), 2000);
    } catch {
      toast.error("Copying failed — select the snippet and copy it manually.");
    }
  }

  const example = integrationExample();

  const header = (
    <PageHeader
      title="API Keys"
      description="Keys authenticate usage reporting to the metering endpoint. Secrets are hashed server-side and shown once."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
          >
            <RefreshCw
              className={list.isFetching ? "size-4 animate-spin" : "size-4"}
              aria-hidden="true"
            />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Create API key
          </Button>
        </div>
      }
    />
  );

  if (list.isError && !list.data) {
    const message =
      list.error instanceof ApiError
        ? list.error.message
        : "API keys could not be loaded.";
    return (
      <div className="space-y-6">
        {header}
        <Alert variant="destructive" role="alert">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Could not load API keys</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <span className="min-w-0 flex-1">{message}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void list.refetch()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const keys = list.data ?? [];

  return (
    <div className="space-y-6">
      {header}

      <Card>
        <CardHeader>
          <CardTitle>Active keys</CardTitle>
          <CardDescription>
            Revoke a key to stop it from authenticating immediately. Revocation
            cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.isPending && !list.data ? (
            <LoadingSkeleton lines={5} />
          ) : (
            <ApiKeyTable
              keys={keys}
              onRevoke={(key) => setPendingRevoke(key)}
              isRevoking={revokeMutation.isPending}
              emptyContent={
                <span className="inline-flex flex-col items-center gap-2 text-muted-foreground">
                  <KeyRound className="size-5" aria-hidden="true" />
                  No API keys yet — create one to start reporting usage.
                </span>
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Developer integration</CardTitle>
            <CardDescription>
              Report a billable event with your key and a unique idempotency
              key — the backend rejects duplicates.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleCopyExample()}>
            {copiedExample ? (
              <>
                <Check className="size-4 text-success" aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-4" aria-hidden="true" />
                Copy
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/60 px-4 py-3.5 font-mono text-xs leading-relaxed text-muted-foreground">
            <code>{example}</code>
          </pre>
        </CardContent>
      </Card>

      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (name) => {
          await createMutation.mutateAsync(name);
        }}
      />

      <ApiKeyRevealDialog
        plaintext={revealed?.plaintext ?? null}
        keyName={revealed?.name ?? ""}
        onOpenChange={(open) => {
          if (!open) setRevealed(null);
        }}
      />

      <Dialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke “{pendingRevoke?.name}”?</DialogTitle>
            <DialogDescription>
              Requests using this key will fail immediately. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingRevoke(null)}
              disabled={revokeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => {
                if (pendingRevoke) {
                  revokeMutation.mutate(pendingRevoke.id);
                }
              }}
            >
              {revokeMutation.isPending ? "Revoking…" : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
