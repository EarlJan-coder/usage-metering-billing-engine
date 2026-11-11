import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Help Center" };

const FAQ: Array<{ question: string; answer: string }> = [
  {
    question: "Why do I see “No usage data yet”?",
    answer:
      "The dashboard reads exclusively from the backend REST API. Confirm the backend is running and NEXT_PUBLIC_API_BASE_URL points at it, then send a metering event — data appears on Overview immediately after.",
  },
  {
    question: "Where is my API key shown?",
    answer:
      "Only once, right after you create it. The backend stores a hash, so copy it into your service immediately. If you lose it, revoke the key and create a new one.",
  },
  {
    question: "How is my bill calculated?",
    answer:
      "The frontend never calculates authoritative costs. The backend pricing engine prices every event with versioned rates (input, output, cached, and reasoning tokens) and returns totals to this dashboard.",
  },
  {
    question: "What happens when I hit my quota?",
    answer:
      "The backend rejects further billable requests with HTTP 429 until the billing period resets, or you upgrade your plan. Usage alerts notify you before you get there.",
  },
  {
    question: "Did my upgrade to Pro succeed?",
    answer:
      "Checkout redirects are not proof of payment. The dashboard refreshes subscription state from the backend after you return, and only verified Stripe webhooks activate the plan.",
  },
];

const QUICK_LINKS: Array<{
  title: string;
  description: string;
  href: string;
  cta: string;
}> = [
  {
    title: "Create an API key",
    description: "Generate the key your service uses to report usage.",
    href: "/api-keys",
    cta: "Go to API Keys",
  },
  {
    title: "Understand your usage",
    description: "Explore trends, breakdowns, and exports.",
    href: "/analytics",
    cta: "Open Analytics",
  },
  {
    title: "Change your plan",
    description: "Compare Free and Pro limits and upgrade via Stripe.",
    href: "/billing",
    cta: "View plans",
  },
];

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Help Center"
        description="Quick answers to common questions about metering, quotas, and billing."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Card key={link.href}>
            <CardHeader>
              <CardTitle className="text-sm">{link.title}</CardTitle>
              <CardDescription>{link.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={link.href}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {link.cta} →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-primary" aria-hidden="true" />
            Frequently asked questions
          </CardTitle>
          <CardDescription>
            Still stuck? Open an issue on the project repository with your
            question and the error you are seeing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((item, index) => (
              <AccordionItem key={index} value={`faq-${index}`}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
