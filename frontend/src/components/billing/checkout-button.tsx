import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Upgrade action (frontend-plan §7 — CheckoutButton). Asks the backend to
 * create a Stripe Checkout session (POST /subscriptions/checkout), then the
 * page hands the returned URL to navigateToCheckout. Nothing here claims
 * payment success — that only comes from the backend's verified webhook
 * (backend-plan §5G).
 */
export function CheckoutButton({
  planName,
  isPending,
  onClick,
  className,
}: {
  planName: string;
  /** True while the checkout session request is in flight. */
  isPending: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      className={className ?? "w-full"}
      onClick={onClick}
      disabled={isPending}
    >
      <CreditCard className="size-4" aria-hidden="true" />
      {isPending ? "Starting checkout…" : `Upgrade to ${planName}`}
    </Button>
  );
}
