"use client";

import { Trash2 } from "lucide-react";

import { DataTable, type Column } from "@/components/data/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { ApiKey } from "@/lib/api/api-keys";
import { formatDateTime } from "@/lib/format";

/**
 * API key list (frontend-plan §7 — APIKeyTable): name, masked key,
 * status, creation date, last-used date, and revocation (§6F).
 */
export function ApiKeyTable({
  keys,
  onRevoke,
  isRevoking = false,
  emptyContent,
}: {
  keys: ApiKey[];
  onRevoke: (key: ApiKey) => void;
  isRevoking?: boolean;
  emptyContent?: React.ReactNode;
}) {
  const columns: Array<Column<ApiKey>> = [
    {
      key: "name",
      header: "Name",
      cell: (key) => <span className="font-medium">{key.name}</span>,
    },
    {
      key: "maskedKey",
      header: "Key",
      cell: (key) =>
        key.maskedKey ? (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {key.maskedKey}
          </code>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (key) => <StatusBadge status={key.status} />,
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (key) => (
        <span className="tabular-nums text-muted-foreground">
          {formatDateTime(key.createdAt)}
        </span>
      ),
    },
    {
      key: "lastUsedAt",
      header: "Last used",
      cell: (key) => (
        <span className="tabular-nums text-muted-foreground">
          {key.lastUsedAt ? formatDateTime(key.lastUsedAt) : "Never"}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (key) => (
        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            disabled={isRevoking}
            onClick={(event) => {
              event.stopPropagation();
              onRevoke(key);
            }}
            aria-label={`Revoke ${key.name}`}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Revoke
          </Button>
        </div>
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={keys}
      getRowId={(key) => key.id}
      caption="API keys"
      emptyContent={
        emptyContent ?? (
          <span className="text-muted-foreground">No API keys yet.</span>
        )
      }
    />
  );
}
