# Frontend Development Plan — Usage Metering & Billing Engine

## 1. Objective

Build a modern, polished SaaS dashboard for the Usage Metering & Billing Engine.

The frontend should allow customers to monitor usage, understand costs, manage API keys, manage subscriptions, and visualize their usage data.

The frontend must consume the backend REST API. It must not independently calculate authoritative billing totals, enforce quotas, or determine subscription status.

## 2. Technology Stack

- **Framework:** Next.js
- **Language:** TypeScript
- **UI:** React
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui
- **Icons:** Lucide
- **Charts:** Recharts
- **Forms:** React Hook Form
- **Validation:** Zod
- **Server State:** TanStack Query
- **Animations:** Framer Motion
- **Notifications:** Sonner

## 3. Frontend Architecture

Use a feature-based structure.

```text
frontend/
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   └── api/
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── charts/
│   │   ├── tables/
│   │   └── shared/
│   ├── features/
│   │   ├── auth/
│   │   ├── overview/
│   │   ├── usage/
│   │   ├── analytics/
│   │   ├── billing/
│   │   ├── subscriptions/
│   │   ├── api-keys/
│   │   ├── settings/
│   │   └── admin/
│   ├── hooks/
│   ├── lib/
│   │   ├── api/
│   │   ├── auth/
│   │   ├── utils/
│   │   └── validations/
│   ├── types/
│   └── styles/
├── public/
└── package.json
```

Keep components reusable and business logic separate from presentation.

## 4. SaaS UI/UX Design Direction

### Design Inspiration

Aim for a professional developer-focused SaaS product inspired by:
- Stripe Dashboard.
- Linear.
- Vercel.
- Supabase.
- Raycast.

The interface should feel like a real commercial SaaS product, not a generic school dashboard.

### Visual Style

Use a clean, minimal interface with:
- Generous whitespace.
- Clear visual hierarchy.
- Subtle borders.
- Restrained shadows.
- Rounded cards.
- Consistent typography.
- Data-focused layouts.
- Smooth but restrained animations.

### Color System

**Light Theme**

| Token | Color |
|---|---|
| Background | `#F8FAFC` |
| Surface | `#FFFFFF` |
| Primary Text | `#0F172A` |
| Secondary Text | `#64748B` |
| Border | `#E2E8F0` |
| Accent | `#6366F1` |
| Success | `#16A34A` |
| Warning | `#F59E0B` |
| Error | `#EF4444` |

**Dark Theme**

| Token | Color |
|---|---|
| Background | `#09090B` |
| Surface | `#18181B` |
| Elevated Surface | `#202024` |
| Primary Text | `#FAFAFA` |
| Secondary Text | `#A1A1AA` |
| Border | `#27272A` |
| Accent | `#818CF8` |

Use Geist Sans or Inter as the primary font.

### Layout Standards

- Sidebar: approximately 240px.
- Header: approximately 64px.
- Card radius: 10–14px.
- Consistent spacing based on a 4px scale.
- Responsive layouts for desktop, tablet, and mobile.
- Light theme as the default, with dark theme support.

## 5. Application Layout

### Sidebar Navigation

**Workspace**
- Overview
- Usage Analytics
- Usage History
- API Keys

**Billing**
- Subscription
- Costs & Billing
- Invoices (when implemented)

**Administration**
- Team Members
- Settings

**Additional**
- Documentation
- Help Center
- Theme Switcher
- User Profile

### Header

Include:
- Breadcrumb navigation.
- Current workspace name.
- Notification indicator.
- Theme switcher.
- User profile dropdown.

The layout should remain consistent across authenticated pages.

## 6. Required Pages and Features

### A. Marketing Landing Page

Create a professional SaaS landing page.

Sections:
1. Hero section.
2. Product introduction.
3. Feature highlights.
4. Usage metering explanation.
5. Pricing section.
6. Developer-focused benefits.
7. FAQ.
8. Footer.

Primary actions:
- Get Started.
- View Pricing.
- Sign In.

### B. Authentication

Create:
- Sign-up page.
- Login page.
- Forgot-password page.
- Authentication loading states.
- Form validation.
- Error handling.

Connect authentication to the backend.

Do not store sensitive authentication information in insecure browser storage.

### C. Overview Dashboard

The main dashboard should give customers an immediate understanding of their usage.

**KPI Cards**
- Total API Calls.
- AI Tokens Consumed.
- Estimated Monthly Cost.
- Current Subscription.

**Charts**
- API calls over time.
- AI token consumption over time.
- Estimated cost trends.

**Additional Sections**
- Usage progress indicators.
- Recent usage activity.
- Subscription information.
- Usage alerts.
- Quick actions.

### D. Usage Analytics

Create a detailed analytics page.

Include:
- API usage chart.
- AI token usage chart.
- Cost trend chart.
- Usage by API key.
- Usage by model, when model metadata is available.
- Date range filters.
- Daily, weekly, and monthly views.
- CSV export.

Charts should use real backend data.

### E. Usage History

Create a searchable and filterable usage table.

Columns:
- Timestamp.
- Event ID.
- Usage Type.
- API Key.
- Model, if applicable.
- Input Tokens.
- Output Tokens.
- Cost.
- Status.

Features:
- Search.
- Date filtering.
- Sorting.
- Pagination.
- CSV export.
- Event details drawer.

Provide clear empty, loading, and error states.

### F. API Key Management

Create an API key management page.

Features:
- Generate API key.
- Display newly generated key once.
- Copy key.
- Revoke key.
- Show creation date.
- Show last-used date.
- Show key status.

Include a developer integration example:

```bash
curl -X POST http://localhost:4000/api/v1/metering/track \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Idempotency-Key: unique-request-id" \
  -H "Content-Type: application/json" \
  -d '{"type":"api_call","quantity":1}'
```

Use the actual backend API contract when finalizing the example.

### G. Billing and Subscription

Create a billing page showing:

- Current plan.
- Subscription status.
- Current billing period.
- Usage limits.
- Current consumption.
- Estimated costs.
- Upgrade and downgrade options.

Include Free and Pro plan cards.

Integrate Stripe Checkout through the backend.

Important:
- Never assume payment succeeded from the redirect URL.
- Refresh subscription information from the backend.
- Display pending, active, canceled, and failed states appropriately.

### H. Settings

Include:
- Account settings.
- Profile information.
- Workspace information.
- Theme preferences.
- Security settings.

### I. Admin Dashboard

Create an administrative interface for authorized administrators.

Include:
- Total tenants.
- Active subscriptions.
- Usage overview.
- Estimated platform revenue.
- Recent webhook events.
- Background job status.
- Tenant management.

Restrict access using backend authorization.

## 7. Reusable Component System

Create reusable components:

**Layout**
- AppSidebar
- AppHeader
- DashboardLayout
- PageHeader
- Breadcrumbs
- WorkspaceSwitcher

**Dashboard**
- MetricCard
- UsageProgress
- SubscriptionCard
- UsageChart
- CostBreakdown
- ActivityFeed

**Data**
- DataTable
- TableFilters
- DateRangePicker
- StatusBadge
- EmptyState
- LoadingSkeleton

**Billing**
- PlanCard
- PricingComparison
- CheckoutButton
- BillingSummary

**API Keys**
- APIKeyTable
- CreateAPIKeyDialog
- APIKeyRevealDialog

Maintain consistent design and behavior across the application.

## 8. Frontend Development Phases

### Phase 1 — Project Setup
- Initialize Next.js.
- Configure TypeScript.
- Configure Tailwind CSS.
- Install shadcn/ui.
- Configure Lucide icons.
- Configure Recharts.
- Establish folder structure.

### Phase 2 — Design System
- Configure color tokens.
- Configure typography.
- Establish spacing and layout standards.
- Build reusable UI components.
- Implement light and dark themes.

### Phase 3 — Application Shell
- Build sidebar.
- Build header.
- Build dashboard layout.
- Build responsive navigation.
- Implement profile dropdown.

### Phase 4 — Authentication
- Build login and registration.
- Connect backend authentication.
- Implement protected routes.
- Handle session expiration.
- Implement loading and error states.

### Phase 5 — Overview Dashboard
- Build KPI cards.
- Connect usage summary API.
- Implement charts.
- Implement usage progress.
- Display recent activity.

### Phase 6 — Analytics and Usage History
- Build analytics charts.
- Add date filters.
- Build usage history table.
- Implement search and pagination.
- Implement CSV export.

### Phase 7 — API Key Management
- Build API key table.
- Implement key creation.
- Implement one-time key reveal.
- Implement revocation.
- Add developer integration examples.

### Phase 8 — Billing and Subscription
- Build pricing cards.
- Build billing overview.
- Integrate Stripe Checkout.
- Display subscription status.
- Implement upgrade and downgrade flows.

### Phase 9 — Settings and Admin
- Build account settings.
- Build workspace settings.
- Build admin dashboard.
- Connect admin APIs.
- Apply role-based access.

### Phase 10 — Polish and Integration
- Responsive testing.
- Accessibility improvements.
- Loading skeletons.
- Empty states.
- Error states.
- Microinteractions.
- API integration testing.
- Visual consistency review.

## 9. Frontend Definition of Done

- [ ] Landing page is complete.
- [ ] Authentication works with the backend.
- [ ] Dashboard displays real usage data.
- [ ] Analytics charts use backend data.
- [ ] Usage history supports filtering and pagination.
- [ ] API key management works.
- [ ] Billing page displays subscription information.
- [ ] Stripe Checkout integration works through the backend.
- [ ] Admin pages enforce authorization.
- [ ] Light and dark themes work.
- [ ] Responsive layouts work.
- [ ] Loading, empty, and error states are implemented.
- [ ] No sensitive billing logic is handled exclusively by the frontend.
- [ ] No critical UI interactions are decorative or nonfunctional.

## 10. Frontend Integration Rules

The frontend must treat the backend as the source of truth.

- Do not calculate authoritative usage totals independently.
- Do not calculate authoritative billing costs independently.
- Do not decide whether a subscription is active independently.
- Do not bypass backend quota enforcement.
- Do not expose Stripe secret keys.
- Do not expose API key plaintext after its initial reveal.
- Use typed API response definitions.
- Handle HTTP errors consistently.
- Use a centralized API client.
- Keep environment variables separated between public and server-only values.

The frontend must be capable of running independently against a configured backend API.