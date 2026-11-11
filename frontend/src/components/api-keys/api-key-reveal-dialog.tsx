"use client";

import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * One-time secret reveal (frontend-plan §7 — APIKeyRevealDialog, §6F:
 * "Display newly generated key once", "Copy key"). Closing the dialog
 * discards the secret permanently — the backend stores only a hash.
 */
export function ApiKeyRevealDialog({
  plaintext,
  keyName,
  onOpenChange,
}: {
  /** The one-time secret; null hides the dialog. */
  plaintext: string | null;
  keyName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      toast.success("API key copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copying failed — select the key and copy it manually.");
    }
  }

  return (
    <Dialog open={plaintext !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy your new API key</DialogTitle>
          <DialogDescription>
            This is the only time the secret for “{keyName}” will be shown.
          </DialogDescription>
        </DialogHeader>

        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <p>
            Store it now in a secrets manager. Once you close this dialog the
            key cannot be shown again — only its hash exists on the server.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2.5">
          <code className="min-w-0 flex-1 break-all font-mono text-sm">
            {plaintext}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleCopy()}
            aria-label="Copy API key"
          >
            {copied ? (
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
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
