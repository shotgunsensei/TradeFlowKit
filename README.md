# TradeFlow

[![CI](https://github.com/shotgunninjas/tradeflowkit/actions/workflows/ci.yml/badge.svg)](https://github.com/shotgunninjas/tradeflowkit/actions/workflows/ci.yml)

> Run your trade business from your phone — jobs, quotes, invoices, customers, and team in one place.

TradeFlow is a multi-tenant practice-management platform for blue-collar service businesses (electricians, plumbers, HVAC, carpenters, landscapers, general contractors). It is the **business-operations & revenue-flow command center** in the [Shotgun Ninjas Productions](https://shotgunninjas.com) ecosystem.

## Features

- **Job tracking** — kanban + list view, lead → quoted → scheduled → in-progress → done → invoiced → paid
- **Quotes & invoices** — line items, tax, discounts, PDF export, email delivery, public pay-by-link
- **Customer history** — full timeline of jobs, quotes, invoices and notes
- **Team management** — roles (owner, admin, tech, viewer), invite codes, workload view
- **Call Recovery AI** — Twilio-backed missed-call SMS auto-responder that captures new leads (add-on)
- **Online payments** — Stripe Connect; customers pay invoices by card, money goes straight to the trades-person
- **Auto reminders** — overdue invoice + pending quote SMS follow-ups (Small Business+)
- **Recurring jobs** — auto-create the next job when the current one is closed (Small Business+)
- **Business analytics** — quote acceptance, collection rate, days-to-payment, busiest day, repeat-customer ratio
- **Mobile-first PWA** — installable from any modern browser

## Tech stack

- **Frontend:** React 18, Vite, Wouter, TanStack Query v5, shadcn/ui, Tailwind CSS, Recharts
- **Backend:** Node 20, Express 5, Drizzle ORM, PostgreSQL, Helmet, express-rate-limit
- **Integrations:** Stripe (subscriptions + Connect), Twilio (SMS + voice), SendGrid (email), OpenAI (Call Recovery AI)
- **Hosting:** Replit Deployments (Reserved VM)

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `SESSION_SECRET` | yes | Express session signing secret |
| `REPLIT_DOMAINS` | prod | Comma-separated public hostnames; used for Stripe webhook + email links |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | yes | Stripe API keys (auto-provisioned via Replit Stripe connector) |
| `SENDGRID_API_KEY` | optional | Required to send invoice / quote emails |
| `SENDGRID_FROM_EMAIL` | optional | Verified sender address |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | optional | Required for SMS reminders + Call Recovery |
| `OPENAI_API_KEY` | optional | Required for Call Recovery AI conversation |
| `PLATFORM_FEE_PERCENT` | optional | Stripe Connect application-fee % (default 0.5) |

## Run locally

```bash
npm ci
npm run db:push      # push Drizzle schema to your local Postgres
npm run dev          # starts Express + Vite on port 5000
```

Then open <http://localhost:5000>.

Type-check the project with `npm run check`. Build a production bundle with `npm run build` and run it via `npm start`.

## Deploy on Replit

This repo is designed to deploy as-is on a Replit Reserved VM:

1. Click **Deploy → Reserved VM**.
2. Set the secrets listed above on the deployment.
3. The published app will appear at `https://<your-app>.replit.app`. Stripe webhooks are auto-registered using `REPLIT_DOMAINS`.

Production database migrations are applied with `npm run db:push` against the production `DATABASE_URL`.

## Ecosystem

TradeFlow is part of the [Shotgun Ninjas Productions](https://shotgunninjas.com) family of focused tools that share a common brand, billing model, and design language:

- **TradeFlowKit.com** — business ops, jobs, quotes, invoices, team *(this product)*
- **TorqueShed.pro** — automotive diagnostics, repair cases, parts, mechanic community
- **TechDeck.app** — IT operations, scripts, automation, MSP/power-user tooling
- **PulseDesk.support** — healthcare operations coordination
- **FaultlineLab.com** — diagnostic challenge & training platform
- **ShotgunNinjaVillage.com** — community, entertainment, games, merch

## License

MIT © Shotgun Ninjas Productions
