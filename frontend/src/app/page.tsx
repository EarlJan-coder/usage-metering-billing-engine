import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Braces,
  Check,
  CreditCard,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: { absolute: "Usage Metering & Billing Engine" },
  description:
    "Track API and AI token usage, enforce plan quotas, and turn metered events into accurate bills with a REST API built for SaaS products.",
};

const FEATURES = [
  {
    icon: Activity,
    title: "Real-time usage tracking",
    description:
      "Every API call and AI token batch is recorded with an idempotency key, so retries never double-count and your numbers stay trustworthy.",
  },
  {
    icon: BarChart3,
    title: "Cost analytics",
    description:
      "Explore API calls, token consumption, and estimated cost trends over daily, weekly, and monthly windows — with CSV export.",
  },
  {
    icon: ShieldCheck,
    title: "Quota enforcement",
    description:
      "The backend checks plan limits on every billable request and returns HTTP 429 before your customer can exceed their quota.",
  },
  {
    icon: BadgeCheck,
    title: "Versioned pricing",
    description:
      "Input, output, cached, and reasoning tokens are priced with versioned rates, so historical events keep the pricing they were billed at.",
  },
  {
    icon: CreditCard,
    title: "Stripe-backed billing",
    description:
      "Upgrades and downgrades run through Stripe Checkout, and only verified webhooks change subscription state — redirects prove nothing.",
  },
  {
    icon: KeyRound,
    title: "Secure API keys",
    description:
      "Keys are shown once at creation and stored hashed. Rotate or revoke them any time from the dashboard.",
  },
] as const;

const STEPS = [
  {
    title: "Send",
    description:
      "Your service reports API calls and token usage with an API key and a unique idempotency key.",
  },
  {
    title: "Enforce",
    description:
      "The engine checks your subscription quotas and rejects requests that would exceed them with HTTP 429.",
  },
  {
    title: "Price",
    description:
      "The pricing engine computes exact costs using versioned rates for every token type.",
  },
  {
    title: "Bill",
    description:
      "Stripe Checkout upgrades the plan; verified webhooks sync subscription state back to the dashboard.",
  },
] as const;

const FREE_FEATURES = [
  "1,000 API calls/month",
  "100,000 AI tokens/month",
  "Usage analytics with CSV export",
  "API key management",
  "Community support",
] as const;

const PRO_FEATURES = [
  "Higher configurable API call and token limits",
  "Everything in Free",
  "Stripe-backed subscription management",
  "Priority support",
  "Quota alerts before you hit limits",
] as const;

const DEV_BENEFITS = [
  "Idempotency key on every billable request — safe retries by default",
  "Hashed API keys, revealed exactly once at creation",
  "Typed REST API with consistent JSON error envelopes",
  "Versioned token rates: input, output, cached, and reasoning",
  "Verified Stripe webhooks — no trust placed in browser redirects",
  "Full event history with search, filters, and CSV export",
] as const;

const FAQ: Array<{ question: string; answer: string }> = [
  {
    question: "How does usage metering work?",
    answer:
      "Your backend sends a POST to /metering/track for each billable request, carrying an API key and an idempotency key. The engine records the event, enforces your plan quota, and prices it with versioned rates. The dashboard then reads every number back from the API — nothing is calculated in the browser.",
  },
  {
    question: "What happens when I reach my plan limit?",
    answer:
      "The backend rejects further billable requests with HTTP 429 until the billing period resets, or until you upgrade. Usage alerts in the dashboard warn you before you get there.",
  },
  {
    question: "How is my bill calculated?",
    answer:
      "The pricing engine prices every event with versioned rates for AI input, output, cached, and reasoning tokens, plus per-request API call pricing. Because rates are versioned, historical events always keep the price they were recorded at.",
  },
  {
    question: "Is there a free plan?",
    answer:
      "Yes. The Free plan includes 1,000 API calls and 100,000 AI tokens per month, full usage analytics, and API key management — no credit card required.",
  },
  {
    question: "How do upgrades and downgrades work?",
    answer:
      "Plan changes run through Stripe Checkout. After you return from Stripe, the dashboard refreshes subscription state from the backend, and only verified webhooks activate or change the plan — a redirect alone never counts as payment.",
  },
  {
    question: "Do you store my API keys in plain text?",
    answer:
      "No. Keys are hashed on the backend and displayed exactly once when you create them. If a key is lost, revoke it and issue a new one.",
  },
];

const TRACK_EXAMPLE = `curl -X POST https://api.example.com/api/v1/metering/track \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Idempotency-Key: unique-request-id" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"ai_tokens","quantity":1200}'`;

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-medium uppercase tracking-wider text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* 1. Hero */}
        <section className="relative overflow-hidden border-b border-border/60">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_70%)] opacity-70"
          />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline" className="gap-1.5 px-3 py-1">
                <Sparkles className="size-3 text-primary" aria-hidden="true" />
                Usage metering &amp; billing for SaaS
              </Badge>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
                Know exactly what every API call costs.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
                Track API and AI token usage, enforce plan quotas, and turn
                every metered event into an accurate bill — from one REST API
                built for SaaS teams.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" className="h-11 px-6" asChild>
                  <Link href="/signup">Get Started</Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 px-6"
                  asChild
                >
                  <Link href="#pricing">View Pricing</Link>
                </Button>
                <Button size="lg" variant="ghost" className="h-11 px-6" asChild>
                  <Link href="/login">Sign In</Link>
                </Button>
              </div>
            </div>

            <div className="mx-auto mt-12 max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-primary/5">
              <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full bg-destructive/70"
                />
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full bg-warning/70"
                />
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full bg-success/70"
                />
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  POST /api/v1/metering/track
                </span>
              </div>
              <pre className="overflow-x-auto px-4 py-4 font-mono text-xs leading-relaxed text-muted-foreground">
                <code>{TRACK_EXAMPLE}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* 2. Product introduction */}
        <section className="border-b border-border/60 bg-muted/20">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">
                  One engine, from raw event to revenue
                </h2>
                <p className="mt-4 text-base text-muted-foreground">
                  Most SaaS teams stitch usage tracking, pricing, and billing
                  together by hand — and end up with numbers nobody trusts.
                  This platform is the single source of truth: your services
                  report usage, the engine enforces quotas and prices every
                  event, and your customers see it all in one dashboard.
                </p>
                <Button className="mt-6" asChild>
                  <Link href="/signup">Get Started</Link>
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  {
                    step: "Meter",
                    text: "API calls and tokens recorded idempotently.",
                  },
                  {
                    step: "Enforce",
                    text: "Plan quotas checked before every billable request.",
                  },
                  {
                    step: "Bill",
                    text: "Exact costs synced through Stripe webhooks.",
                  },
                ].map((item) => (
                  <Card key={item.step} className="py-5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{item.step}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {item.text}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Feature highlights */}
        <section id="features" className="scroll-mt-20 border-b border-border/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <SectionHeading
              eyebrow="Features"
              title="Everything you need to meter with confidence"
              description="From the first tracked event to the paid invoice — analytics, enforcement, and billing in one place."
            />
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <Card key={feature.title}>
                  <CardHeader>
                    <span
                      aria-hidden="true"
                      className="mb-2 flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"
                    >
                      <feature.icon className="size-4.5" />
                    </span>
                    <CardTitle className="text-base">
                      {feature.title}
                    </CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Usage metering explanation */}
        <section
          id="how-it-works"
          className="scroll-mt-20 border-b border-border/60 bg-muted/20"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <SectionHeading
              eyebrow="How it works"
              title="Usage metering, explained"
              description="Four steps stand between a customer request and a correct invoice."
            />
            <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <Card className="h-full">
                    <CardHeader>
                      <span
                        aria-hidden="true"
                        className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                      >
                        {index + 1}
                      </span>
                      <CardTitle className="text-base">
                        {step.title}
                      </CardTitle>
                      <CardDescription>{step.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 5. Pricing */}
        <section id="pricing" className="scroll-mt-20 border-b border-border/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <SectionHeading
              eyebrow="Pricing"
              title="Start free, upgrade when you grow"
              description="Plan limits are enforced by the backend — what you see here is what your quota allows."
            />
            <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">Free</CardTitle>
                  <p className="text-3xl font-semibold tracking-tight">
                    $0
                    <span className="text-sm font-normal text-muted-foreground">
                      /month
                    </span>
                  </p>
                  <CardDescription>
                    Everything you need to start metering.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="space-y-2.5 text-sm">
                    {FREE_FEATURES.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-success"
                          aria-hidden="true"
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-6 w-full" asChild>
                    <Link href="/signup">Get Started</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="relative flex flex-col overflow-visible border-primary/40 shadow-lg shadow-primary/5">
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  Recommended
                </Badge>
                <CardHeader>
                  <CardTitle className="text-lg">Pro</CardTitle>
                  <p className="text-3xl font-semibold tracking-tight">
                    Configurable
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      limits
                    </span>
                  </p>
                  <CardDescription>
                    Higher limits, billed through Stripe.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="space-y-2.5 text-sm">
                    {PRO_FEATURES.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-success"
                          aria-hidden="true"
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-6 w-full" asChild>
                    <Link href="/signup">Get Started</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Exact Pro limits and pricing are served from the backend plan
              configuration — the dashboard always displays the live values.
            </p>
          </div>
        </section>

        {/* 6. Developer-focused benefits */}
        <section className="border-b border-border/60 bg-muted/20">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <SectionHeading
                  eyebrow="Developers"
                  title="Built the way you would build it"
                  description="Safe by default, honest about state, and easy to integrate."
                />
                <div className="mt-8 flex justify-center lg:justify-start">
                  <Button variant="outline" asChild>
                    <Link href="/docs">
                      <Braces className="size-4" aria-hidden="true" />
                      Read the API docs
                    </Link>
                  </Button>
                </div>
              </div>
              <ul className="space-y-3">
                {DEV_BENEFITS.map((benefit) => (
                  <li
                    key={benefit}
                    className="flex items-start gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 text-sm"
                  >
                    <Zap
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 7. FAQ */}
        <section id="faq" className="scroll-mt-20 border-b border-border/60">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
            <Accordion type="single" collapsible className="mt-8 w-full">
              {FAQ.map((item, index) => (
                <AccordionItem key={item.question} value={`faq-${index}`}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">
            Ship metering today.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Create an account, send your first event, and watch usage become
            cost — no billing code required.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" className="h-11 px-6" asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 px-6"
              asChild
            >
              <Link href="#pricing">View Pricing</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className={buttonVariants({ variant: "link", className: "p-0" })}
            >
              Sign In
            </Link>
          </p>
        </section>
      </main>

      {/* 8. Footer */}
      <SiteFooter />
    </div>
  );
}
