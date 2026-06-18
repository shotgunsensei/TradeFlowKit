# TradeFlowKit - Service Management Platform

## Overview

TradeFlowKit is a multi-tenant practice management platform for blue-collar service businesses (electricians, plumbers, carpenters, HVAC). It provides a web-based admin portal for managing customers, jobs, quotes, and invoices within isolated organizational contexts.

## Ecosystem Positioning

TradeFlowKit is the **business-operations & revenue-flow command center** in the **Shotgun Ninjas Productions** ecosystem. It is one of several focused tools that share a common brand, billing model, and design language:

- **TradeFlowKit.com** *(this product)* — business ops, jobs, quotes, invoices, team
- **TorqueShed.pro** — automotive diagnostics, repair cases, parts, mechanic community (pairs with TradeFlowKit for shop owners)
- **TechDeck.app** — IT operations, scripts, automation, MSP/power-user tooling (pairs with TradeFlowKit for low-voltage / IT / A-V / security trades)
- **PulseDesk.support** — healthcare operations coordination
- **FaultlineLab.com** — diagnostic challenge & training platform (great for training apprentice techs)
- **ShotgunNinjaVillage.com** — community, entertainment, games, merch
- **ShotgunNinjas.com** — central ecosystem hub

Cross-promotion in TradeFlowKit lives in three places:
1. The marketing landing page (`auth-page.tsx`) has a dedicated "Tools that work with TradeFlow" ecosystem section featuring TorqueShed, TechDeck, and FaultlineLab as cards, plus a full sister-products link row in the footer.
2. The in-app sidebar footer carries a small "Built by Shotgun Ninjas Productions" link to the hub.
3. OG / metadata in `client/index.html` references Shotgun Ninjas Productions as the publisher/author.

Reusable component: `client/src/components/ecosystem-section.tsx` is the cross-promo card grid — drop it into any other Shotgun Ninjas product to maintain consistent ecosystem styling.

The application follows a monolithic full-stack architecture with a React frontend served by an Express backend, backed by PostgreSQL via Drizzle ORM. It supports multi-tenancy through organizations with role-based memberships (owner, admin, tech, viewer).

**Core features:**
- Authentication (username/password with session-based auth)
- Organization creation and invite-code-based joining
- Customer CRUD management
- Job tracking with status workflow (lead → quoted → scheduled → in_progress → done → invoiced → paid → canceled)
- Quote creation with line items, tax, and discounts
- Invoice generation with line items, tax, and discounts
- Dashboard with business metrics
- Settings for profile, organization, team member management, billing usage, password change, and automations (SMS reminders)
- Automated SMS follow-up reminders: overdue invoice reminders and pending quote follow-ups via Twilio, configurable per org (Small Business+ feature), runs every 30 minutes via background worker
  - Settings at /settings#automations: toggles + day selectors for each reminder type
  - All sent reminders logged to reminder_log table; retrievable via GET /api/reminder-logs
  - STOP keyword opt-out honored by Twilio
- Business Analytics page (/analytics) with recharts: quote acceptance rate + 30-day rate, invoice collection rate + avg days to payment, job completion rate + busiest day of week, customer repeat ratio + growth trends
- Call Recovery AI admin controls: enable/disable auto-response, custom message template ({business}/{phone}/{name} placeholders), quiet hours configuration — settings enforced in webhook
- Call Recovery recovery funnel visualization (Missed→Contacted→Responded→Recovered), MoM comparison, Mark as Recovered action per conversation
- Organization profile fields: logo URL (with preview), website, business hours text field
- Note: Invoice aging report shows overdue-only buckets (labeled "Aging Report (overdue only)"); current/no-due-date buckets not charted but included in aging API response
- Note: Team membership API is at /api/memberships (not /api/orgs/:id/members)
- Recurring Jobs: optional recurring schedule on any job (weekly/biweekly/monthly/quarterly/annually); auto-creates next job when current is marked Done or Invoiced; gated to Small Business+ plans; recurring badge on kanban cards, list view, and detail page; "Recurring only" filter on jobs list
- Subscription management with 4 plan tiers (Free, Individual $20/mo, Small Business $100/mo, Enterprise $200/mo)
- Stripe payment integration for subscription checkout and billing portal
- Plan limit enforcement (resource limits on Free tier, team size limits per plan)
- Master admin panel for super admins to manage all tenants, change plans, and view users
- Progressive Web App (PWA) with service worker, installable on mobile devices
- Privacy policy page at /privacy (accessible without login)
- Digital Asset Links for Google Play Store TWA publishing
- OperatorOS role mapping: for users that arrive through `/sso` (have an `operatorosUserId`), OperatorOS owns the platform-level role — `claims.role === "super_admin"` mirrors onto `users.isSuperAdmin = true` on every launch, any other role mirrors to `false`. Manually-flipped `isSuperAdmin` on non-SSO users is unaffected. OperatorOS `plan_slug` is stored on the user but **intentionally not** mapped into TradeFlowKit plan-gates: TFK plans are per-org (Stripe-billed), OperatorOS plan_slug is per-user, so they stay independent. See `docs/OPERATOROS_SSO_DESTINATION.md` "Role mapping" / "Plan slug mapping" sections.
- OperatorOS SSO destination at `/sso` implements the canonical Shotgun Ninjas Child-App SSO Integration contract: HS256 verification, 90-second token age + 5-second clock-skew rules (rejected as `token_expired`), `aud`/`module_slug` must both match `OPERATOROS_SSO_AUDIENCE`. The mandatory consume call goes to `${OPERATOROS_API_URL}/modules/sso/consume` (note: no `/v1`) with **no auth header** and body `{jti, aud, env}`; the 200 response IS the userinfo (`{user:{id,email,name,role}, planSlug, organizationId, …}`) — there is no separate userinfo endpoint. Local users are keyed on **email** (lowercased/trimmed), with `operatorosUserId` stored for audit only. All canonical failures **redirect** to `${OPERATOROS_BASE_URL}/?launchError=<code>`; only consume 5xx/network failures return a local `502 sso_consume_unavailable` plain-text response (since the hub may also be down). Reject vocabulary: `no_token, bad_signature, bad_issuer, bad_module_slug, env_mismatch, token_expired, consume_failed, sso_consume_unavailable` (plus the upstream `code` forwarded verbatim from consume 4xx). Env vars: `MODULE_SSO_SECRET`, `OPERATOROS_BASE_URL`, `OPERATOROS_SSO_AUDIENCE`, `OPERATOROS_SSO_ENV` (`prod`/`staging`/`dev`), `OPERATOROS_API_URL` (e.g. `https://operatoros.net/api`; defaults to base url). Legacy `MODULE_SLUG` / `APP_ENV` still accepted. Production refuses to start without `MODULE_SSO_SECRET`; dev boots fine and `/sso` returns a clean 503 "not configured" page. The hub does not expose a user-organizations endpoint per the contract, so `/api/operatoros/organizations` always returns `{available:false, reason:"unavailable"}` and the settings picker falls back to manual id entry. The `payload.organizationId`-driven auto-join / auto-provision flow remains in code for forward compatibility but no-ops while the field is documented as `null`. See `docs/OPERATOROS_SSO_DESTINATION.md` for the full contract.
- Email PDF quotes/invoices: "Email" button on quote/invoice detail opens a dialog with prefilled recipient/subject/message; server generates a branded PDF with `pdfkit` and sends via SendGrid (`@sendgrid/mail`) with the PDF as an attachment. Requires `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` secrets. Endpoints: `POST /api/quotes/:id/send-email`, `POST /api/invoices/:id/send-email`. Sending a draft quote/invoice auto-promotes it to "sent" status. Delivery status is shown via toast + in-dialog confirmation.
- Invoice payments via Stripe Checkout accept both card and ACH (us_bank_account). The invoice_status enum includes a `processing` interim state for ACH transfers that have been authorized but have not yet settled (3-5 business days). Webhooks: `checkout.session.completed` → marks paid (card) or processing (ACH) based on `payment_status`; `payment_intent.processing` → confirms processing; `payment_intent.succeeded` → marks paid on settlement; `payment_intent.payment_failed` → reverts to `sent` and writes a `payment_failed` audit-log entry the org can see in audit history. Resolution prefers metadata (invoiceId/orgId/feature=invoice_payment on PaymentIntent), falling back to lookup by stored `stripePaymentIntentId`.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (client/)
- **Framework:** React 18 with TypeScript
- **Routing:** Wouter (lightweight alternative to React Router)
- **State/Data Fetching:** TanStack React Query for server state management
- **UI Components:** shadcn/ui component library (new-york style) built on Radix UI primitives
- **Styling:** Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Build Tool:** Vite with React plugin
- **Path Aliases:** `@/` maps to `client/src/`, `@shared/` maps to `shared/`

The frontend follows a page-based structure under `client/src/pages/` with reusable components in `client/src/components/`. Authentication state is managed via a React Context provider (`AuthProvider`) that checks session status via `/api/auth/me`.

### Backend (server/)
- **Framework:** Express 5 on Node.js with TypeScript
- **Runtime:** tsx for development, esbuild for production bundling
- **Session Management:** express-session with connect-pg-simple (PostgreSQL-backed sessions)
- **Authentication:** Custom session-based auth with SHA-256 password hashing (no external auth provider)
- **API Pattern:** RESTful JSON API under `/api/` prefix with middleware guards (`requireAuth`, `requireOrg`)

### Database
- **Database:** PostgreSQL (required, via `DATABASE_URL` environment variable)
- **ORM:** Drizzle ORM with node-postgres driver
- **Schema Location:** `shared/schema.ts` - shared between frontend and backend
- **Migrations:** Drizzle Kit with `db:push` command for schema synchronization
- **Key Tables:** users, orgs, memberships, invite_codes, customers, jobs, job_events, quotes, quote_items, invoices, invoice_items
- **Enums:** membership_role, job_status, quote_status, invoice_status (all PostgreSQL enums)
- **Validation:** drizzle-zod for generating Zod schemas from Drizzle table definitions

### Shared Code (shared/)
- `shared/schema.ts` contains all database table definitions, Zod validation schemas, TypeScript types, and shared constants (status labels, colors, calculation helpers)
- Both frontend and backend import from this package

### Build & Development
- **Dev:** `npm run dev` runs tsx to start the Express server which sets up Vite middleware for HMR
- **Build:** `npm run build` runs a custom build script that uses Vite for the client and esbuild for the server
- **Production:** Built client is served as static files from `dist/public/`, server bundle at `dist/index.cjs`
- **Type Checking:** `npm run check` runs TypeScript compiler in noEmit mode

### Multi-Tenancy Model
- Every data entity (customers, jobs, quotes, invoices) belongs to an `org_id`
- Users can belong to multiple organizations via the `memberships` table
- Session stores the active `orgId` for scoping all queries
- Organization switching is supported in the sidebar UI
- Invite codes allow users to join existing organizations with a specified role

### Storage Layer
- `server/storage.ts` implements an `IStorage` interface abstracting all database operations
- All queries are scoped by `orgId` to enforce tenant isolation at the application level

## External Dependencies

### Required Services
- **PostgreSQL Database:** Required. Connection via `DATABASE_URL` environment variable. Used for all data storage and session management.

### Key npm Dependencies
- **drizzle-orm / drizzle-kit:** Database ORM and migration tooling
- **express / express-session:** HTTP server and session management
- **connect-pg-simple:** PostgreSQL session store
- **@tanstack/react-query:** Server state management on the frontend
- **zod / drizzle-zod:** Runtime validation and schema generation
- **date-fns:** Date formatting utilities
- **wouter:** Client-side routing
- **shadcn/ui ecosystem:** Radix UI primitives, class-variance-authority, clsx, tailwind-merge, lucide-react icons
- **react-day-picker:** Calendar component
- **vaul:** Drawer component
- **recharts:** Chart components
- **embla-carousel-react:** Carousel component
- **react-hook-form / @hookform/resolvers:** Form handling

### Environment Variables
- `DATABASE_URL` (required) - PostgreSQL connection string
- `SESSION_SECRET` (optional, defaults to dev value) - Secret for signing session cookies

### Replit-Specific Plugins
- `@replit/vite-plugin-runtime-error-modal` - Error overlay in development
- `@replit/vite-plugin-cartographer` - Development tooling (dev only)
- `@replit/vite-plugin-dev-banner` - Development banner (dev only)

### Seed Data
- `server/seed.ts` provides demo data seeding with a demo user (username: `demo`, password: `demo123`) and sample organization, customers, and jobs

## Dark Mode Convention

All dark-mode background classes in `client/src/` **must** use the CSS-variable-based semantic utilities (e.g. `dark:bg-background`, `dark:bg-card`, `dark:bg-muted`, `dark:bg-sidebar`) so that the navy theme is applied consistently.

**Bare** `dark:bg-gray-9xx` classes (e.g. `dark:bg-gray-900`, `dark:bg-gray-950`) are **not allowed** because they hard-code a grey value and bypass the theme.  The only exception is **opacity-tinted badge/chip contexts** such as `dark:bg-gray-900/30`.

A CI check enforces this rule automatically:
- Script: `scripts/check-dark-bg.sh` (run locally with `bash scripts/check-dark-bg.sh`)
- GitHub Actions workflow: `.github/workflows/dark-mode-check.yml` (runs on every push/PR that touches `client/src/`)
- Validation command registered as `dark-mode-bg-check` in Replit's validation system

## Testing

Vitest powers unit/integration tests; Playwright powers a single end-to-end spec.

- `npm run test` — run the vitest suite once (CI mode). Covers storage org-scoping, plan-gate enforcement, and Stripe webhook handlers (idempotency + status flips). Tests use the `DATABASE_URL` Postgres database; each suite creates ephemeral orgs/users with random slugs and tears them down via `storage.deleteOrg`. The Stripe signature check is bypassed via `vi.mock('./server/stripeClient')`.
- `npm run test:watch` — watch mode for local development.
- `npm run test:coverage` — vitest with v8 coverage (focused on `server/storage.ts`, `server/webhookHandlers.ts`, `server/routes/automations.ts`).
- `npm run test:e2e` — Playwright e2e for the signup → org → customer → job → quote → invoice → mark-paid flow. Requires the dev server running on `http://localhost:5000` (override with `E2E_BASE_URL`) and Playwright browsers installed (`npx playwright install chromium`).

Test layout:
- `tests/helpers.ts` — org/user setup + cleanup helpers
- `tests/storage-org-scoping.test.ts` — multi-tenant isolation across customers/jobs/quotes/invoices/memberships
- `tests/plan-gate.test.ts` — `/api/automations` 403 for free/individual, 200 for small_business/enterprise; `PLAN_LIMITS` shape; recurring-jobs gate
- `tests/webhooks.test.ts` — checkout per plan tier, replay idempotency, subscription deletion downgrade, payment-failed → past_due, invoice payment marks paid
- `e2e/signup-to-paid.spec.ts` — full signup-to-paid happy path