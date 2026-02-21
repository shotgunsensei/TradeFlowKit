# TradeFlow - Service Management Platform

## Overview

TradeFlow is a multi-tenant practice management platform for blue-collar service businesses (electricians, plumbers, carpenters, HVAC). It provides a web-based admin portal for managing customers, jobs, quotes, and invoices within isolated organizational contexts.

The application follows a monolithic full-stack architecture with a React frontend served by an Express backend, backed by PostgreSQL via Drizzle ORM. It supports multi-tenancy through organizations with role-based memberships (owner, admin, tech, viewer).

**Core features:**
- Authentication (username/password with session-based auth)
- Organization creation and invite-code-based joining
- Customer CRUD management
- Job tracking with status workflow (lead → quoted → scheduled → in_progress → done → invoiced → paid → canceled)
- Quote creation with line items, tax, and discounts
- Invoice generation with line items, tax, and discounts
- Dashboard with business metrics
- Settings for profile, organization, and invite code management

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