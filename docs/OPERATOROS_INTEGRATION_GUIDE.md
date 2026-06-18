# TradeFlowKit ↔ OperatorOS Integration Guide

**Audience:** the OperatorOS hub team.
**Purpose:** everything OperatorOS needs to know to launch users into
TradeFlowKit, drive its plan/feature entitlements, and revoke access —
without reading the TradeFlowKit source.

TradeFlowKit is a child app under the Shotgun Ninjas Productions umbrella.
It is the **business-operations & revenue-flow** module: customers, jobs,
quotes, invoices, automations. When a tenant is "linked" to OperatorOS,
the hub is the single source of truth for what that tenant (and each of
its users) is allowed to do; TradeFlowKit only enforces the decisions
the hub sends.

There are two integration surfaces:

1. **SSO** — a user-driven, short-lived JWT handoff that launches a user
   into TradeFlowKit. (`/sso?token=<jwt>`)
2. **Entitlements push-sync** — a server-to-server REST endpoint the hub
   calls whenever a tenant's plan, feature overrides, or member roles
   change. (`POST /api/operatoros/entitlements/sync`)

Both surfaces use a shared `tenantId` that the hub mints. TradeFlowKit
stores it on `orgs.operatorosTenantId` and uses it as the canonical
linkage key.

The exhaustive destination-side spec for SSO lives in
[`OPERATOROS_SSO_DESTINATION.md`](./OPERATOROS_SSO_DESTINATION.md). This
guide is the hub-facing summary plus the entitlements contract.

---

## 1. Module identity

| Field | Value |
|-------|-------|
| Module slug | `tradeflowkit` (lowercase) |
| Production URL | `https://tradeflowkit.com` (or the customer's custom domain) |
| Audience claim | `tradeflowkit` |
| Supported `env` values | `prod`, `staging`, `dev` |
| Companion modules | `torqueshed`, `techdeck`, `pulsedesk`, `faultlinelab` |

Use `tradeflowkit` for **both** the `aud` and `module_slug` JWT claims.

---

## 2. Secrets the hub must provision

The hub and TradeFlowKit must share two secrets, set as environment
variables on the TradeFlowKit side:

| Secret | Used for | Notes |
|--------|----------|-------|
| `MODULE_SSO_SECRET` | HS256 signing key for `/sso` JWTs | ≥16 chars. Rotated by changing it everywhere at once. |
| `OPERATOROS_SERVICE_TOKEN` | Bearer token on the entitlement push-sync endpoint | Treat as a service credential. Without it, `POST /api/operatoros/entitlements/sync` returns `503 entitlement_sync_not_configured`. |

Plus these non-secret config values:

| Variable | Example | Description |
|----------|---------|-------------|
| `OPERATOROS_BASE_URL` | `https://operatoros.net` | Expected `iss` claim and redirect target for canonical SSO failures. |
| `OPERATOROS_API_URL` | `https://operatoros.net/api` | Where TradeFlowKit POSTs the consume call. **Note: no `/v1`.** |
| `OPERATOROS_SSO_AUDIENCE` | `tradeflowkit` | Expected `aud` and `module_slug`. |
| `OPERATOROS_SSO_ENV` | `prod` | Expected `env` claim. |

If `OPERATOROS_SERVICE_TOKEN` is not set on the TradeFlowKit instance,
the entitlement sync endpoint will refuse every request — provision it
before the hub begins pushing.

---

## 3. SSO: launching a user

### Endpoint

```
GET https://<tradeflowkit-host>/sso?token=<jwt>
```

Public, idempotent for the user, single-use for the JWT (the `jti` is
spent by the consume call).

### JWT shape (HS256)

```
header: { "alg": "HS256", "typ": "JWT" }
```

| Claim | Type | Required | Notes |
|-------|------|----------|-------|
| `iss` | string | yes | Must equal `OPERATOROS_BASE_URL` exactly. |
| `aud` | string | yes | Must equal `tradeflowkit`. |
| `module_slug` | string | yes | Must equal `aud`. |
| `env` | enum | yes | `prod` / `staging` / `dev`. Must match the destination's env. |
| `jti` | string | yes | Single-use id; spent by the consume call. |
| `iat` | number (sec) | yes | Issued-at. |
| `exp` | number (sec) | yes | Recommended `iat + 90`. |
| `sub` | string | optional | OperatorOS user id; stored for audit only — NOT used to key the local user. |

**TTL:** 90 seconds with a ±5 second clock-skew tolerance. Tokens older
than 95 s on the wire are rejected as `token_expired` even if `exp`
hasn't passed.

The identity, email, role, plan, and tenant id all come from the
**consume response**, not from the JWT. The JWT is purely a handoff.

### The consume call (hub → hub)

After verifying the JWT signature and claims, TradeFlowKit calls the
hub at:

```
POST {OPERATOROS_API_URL}/modules/sso/consume
content-type: application/json

{ "jti": "...", "aud": "tradeflowkit", "env": "prod" }
```

No `Authorization` header. The 5-second timeout is enforced
client-side. The 200 response IS the userinfo — there is no separate
userinfo endpoint, and TradeFlowKit will never ask for one.

#### Required 200 body

```json
{
  "ok": true,
  "user": {
    "id": "u_…",
    "email": "alice@example.com",
    "name": "Alice",
    "role": "user"
  },
  "moduleSlug": "tradeflowkit",
  "planSlug": "starter",
  "organizationId": "tnt_abc123",
  "env": "prod",
  "jti": "…",
  "issuer": "https://operatoros.net",
  "accessSource": "plan"
}
```

| Field | Effect on TradeFlowKit |
|-------|------------------------|
| `user.id` | Stored on `users.operatorosUserId` for audit and member sync. |
| `user.email` | **Primary identity key.** Lowercased + trimmed. Lazy-provisions a new local user on first launch. |
| `user.name` | Used as `fullName` on first launch. |
| `user.role` | `super_admin` → mirrors onto `users.isSuperAdmin = true`. Anything else → `false`. Mirrored on EVERY launch (the hub can revoke super-admin by changing the role). |
| `planSlug` | Stored on `users.operatorosPlanSlug` for visibility; does NOT drive entitlements. (Tenant-level `planSlug` does — see §5.) |
| `organizationId` | If set, becomes the tenant linkage id (see §4). |

#### Non-2xx body

```json
{ "code": "TOKEN_REPLAYED" }
```

`code` is forwarded verbatim into the hub redirect's `launchError`
parameter. 5xx / network failures get a `502 sso_consume_unavailable`
plain-text response from TradeFlowKit and do NOT redirect back to the
hub.

### Failure modes (canonical)

All canonical failures **redirect** the user back to
`${OPERATOROS_BASE_URL}/?launchError=<code>`. The hub renders the error
to the operator.

| Code | When |
|------|------|
| `no_token` | `?token=` absent. |
| `bad_signature` | HS256 verify failed, `alg=none`, malformed JWT, or missing structural claim. |
| `bad_issuer` | `iss` ≠ `OPERATOROS_BASE_URL`. |
| `bad_module_slug` | `aud` ≠ `tradeflowkit`, or `module_slug` ≠ `aud`. |
| `env_mismatch` | `env` ≠ destination's `OPERATOROS_SSO_ENV`. |
| `token_expired` | `exp` in the past or age > 95 s. |
| `consume_failed` | Consume 4xx with no upstream `code`. |
| `sso_consume_unavailable` | Consume 5xx / network failure. (502 plain text, NOT a hub redirect.) |
| Upstream `code` | Forwarded verbatim, e.g. `TOKEN_REPLAYED`, `TOKEN_EXPIRED`, `AUDIENCE_MISMATCH`. |

---

## 4. Tenant linking

A TradeFlowKit org becomes "linked" to OperatorOS when the hub supplies
an `organizationId` on the consume payload, OR when the push-sync
endpoint references its `tenantId`.

There are three SSO outcomes when `organizationId` is present:

| Situation | Result | Redirect |
|-----------|--------|----------|
| A local org already has `operatorosOrganizationId = <id>` | User added to that org as `admin` / `tech` / `viewer` per `user.role` | `/dashboard?sso=joined` |
| No linked org, and the user has zero TradeFlowKit orgs | Auto-provision a new org owned by the user, linked to `<id>` | `/dashboard?sso=provisioned` |
| Linked org exists, user is already a member | No changes | `/dashboard?sso=signed_in` |

When `organizationId` is null, the user lands on `/dashboard` and uses
the normal "create or join" flow.

**Important security property:** an SSO launch only ever bootstraps the
**launch tenant's** membership. If a user belongs to several linked
orgs, launching from tenant A does NOT write any role / enabled / module
data onto their membership in tenant B. Sibling memberships are kept
fail-closed (`no_module_role`) until the hub pushes them via §5.

---

## 5. Entitlements push-sync (server-to-server)

This is how the hub tells TradeFlowKit what a tenant is paying for, what
features are flipped on for that tenant, and what each user is allowed
to do inside it.

### Endpoint

```
POST https://<tradeflowkit-host>/api/operatoros/entitlements/sync
Authorization: Bearer <OPERATOROS_SERVICE_TOKEN>
content-type: application/json
```

| HTTP | Meaning |
|------|---------|
| `200` | Applied (response body details below). |
| `400 invalid_body` | Body failed schema validation (unknown feature key, wrong types, etc.). |
| `401 unauthorized` | Missing / wrong bearer token. Constant-time compared. |
| `404 tenant_not_linked` | No local org has `operatorosTenantId = <tenantId>`. TradeFlowKit **does not auto-create** tenants here — they have to land via the SSO auto-provision path first. |
| `503 entitlement_sync_not_configured` | The destination has no `OPERATOROS_SERVICE_TOKEN` provisioned. |
| `500` | Unexpected error; safe to retry. |

### Request body

```ts
{
  tenantId: string;                  // required, matches orgs.operatorosTenantId
  planSlug?: string | null;          // "starter" | "pro" | "elite" | null
  subscriptionStatus?: string | null;// "active" | "trialing" | "grace" | "past_due_grace" | "canceled" | …
  accessLevel?: string | null;       // see §5.3
  features?: Partial<Record<FeatureKey, boolean>>;
  limits?: {
    customers?: number; jobs?: number; quotes?: number;
    invoices?: number; teamMembers?: number;
    // -1 means "unlimited".
  };
  members?: Array<{
    operatorosUserId: string;        // required
    moduleRole?: "module_admin" | "module_user" | "viewer" | "none";
    enabled?: boolean;
    tenantRole?: string | null;
    permissions?: string[];
  }>;
}
```

### Response body

```json
{
  "ok": true,
  "orgId": "…",
  "memberUpdates": 3,
  "memberSkipped": 0,
  "snapshot": { /* persisted tenant snapshot */ },
  "tenantUpdated": true
}
```

`memberSkipped` counts members whose `operatorosUserId` does not match
any local membership — typically users who haven't completed their first
SSO launch yet. **Push them again** after they've launched.

### 5.1 Plan slugs

The hub picks one of these `planSlug` values per tenant. Each slug ships
a default feature + limit bundle; the hub can override individual bits
via `features` / `limits` without changing the slug.

| Slug | Defaults (true unless noted) |
|------|------------------------------|
| `default` / unknown / null | All gated features **off**. Limits: 5 customers / 5 jobs / 5 quotes / 5 invoices, 1 team member. |
| `starter` | `analytics`, `unlimited_entities`, `customer_portal`, `review_requests`, `stripe_connect`. Limits: unlimited entities, 1 team member. |
| `pro` | All `starter` features + `automations`, `recurring_jobs`, `team_invites`, `accounting_export`, `recurring_invoices`. Off by default: `call_recovery`, `audit_log`. Limit: 25 team members. |
| `elite` | All features on. All limits unlimited. |

If the hub sends a slug TradeFlowKit doesn't recognise, it is treated as
`default` (everything off).

### 5.2 Subscription status

Only these statuses grant runtime access (`access.allowed = true`):

```
active, trialing, grace, past_due_grace
```

Anything else (`canceled`, `past_due`, `unpaid`, etc.) flips the tenant
to `tenant_inactive` and every page in TradeFlowKit shows the AccessDenied
screen with a button to open the OperatorOS billing portal.

### 5.3 Access level

`accessLevel` is the hub's tenant-wide kill switch:

| Value | Effect |
|-------|--------|
| `full` / unset / null | Normal — feature bits determine access. |
| `none` / `disabled` / `revoked` | Tenant short-circuits to denied. All features resolve `false`, every gated route returns the AccessDenied screen. |

Use it to disable a tenant immediately without touching the plan, e.g.
during a payment dispute investigation.

### 5.4 Feature keys

Pass any subset on `features`; omitted keys preserve the previously
stored value.

| Key | What it gates |
|-----|---------------|
| `automations` | SMS follow-ups + reminders (background worker honors this for linked tenants). |
| `recurring_jobs` | Recurring job schedules. |
| `analytics` | Business Analytics page. |
| `team_invites` | Inviting additional members (also reads `limits.teamMembers`). |
| `unlimited_entities` | Removes per-resource caps from `limits`. |
| `call_recovery` | Call Recovery AI module + missed-call funnel. |
| `audit_log` | Audit-log read API + UI. |
| `accounting_export` | QuickBooks / Xero CSV export. |
| `customer_portal` | Tokenised customer portal links. |
| `review_requests` | Review-request automations. |
| `recurring_invoices` | Recurring invoice schedules. |
| `stripe_connect` | Tenant-owned Stripe Connect onboarding/payouts. |

Unknown keys → `400 invalid_body`. Values must be booleans; `null` is
not accepted — omit the key to leave it unchanged.

### 5.5 Override precedence

For every feature key, TradeFlowKit resolves access in this order:

1. The most recent value pushed under `features[<key>]` on the tenant
   snapshot.
2. The `planSlug` default for any key the snapshot has never set.
3. `false` if neither is available (fail-closed).

`accessLevel ∈ {none, disabled, revoked}` short-circuits the whole
tenant to denied regardless of any feature bit.

### 5.6 Partial-update semantics

The endpoint is partial at every layer — safe to call with just the
fields that changed.

- **Members-only payload** (no `planSlug` / `subscriptionStatus` /
  `accessLevel` / `features` / `limits`): leaves the tenant snapshot
  untouched, only updates the listed memberships and bumps
  `lastEntitlementSyncAt`.
- **Tenant payload** that omits a feature key: keeps the previous
  override on disk. To restore a feature to its plan-slug default,
  send that key with the value matching the slug's default — there is
  no "clear override" sentinel.
- Pushing `planSlug: null` is the explicit way to unlink a tenant from
  any plan (drops it to `default` defaults).

### 5.7 Member sync rules

Each entry under `members[]` updates exactly one local membership row,
keyed on `operatorosUserId`. TradeFlowKit will never auto-create a
local user from a sync — users always land via `/sso` first.

| `moduleRole` | Local `memberships.role` after sync |
|--------------|--------------------------------------|
| `module_admin` | `admin` |
| `module_user` | `tech` |
| `viewer` | `viewer` |
| `none` | `viewer` (clamped; user is also gated out by `no_module_role`) |

**Owners are sacred:** OperatorOS can never demote a TradeFlowKit `owner`
via push-sync. If you need to remove an owner's access, send
`enabled: false` or set their `accessLevel` at the tenant scope.

`enabled: false` keeps the membership row but causes every gated route
to deny with `user_disabled` — preferred over deleting the membership,
since it's reversible by sending `enabled: true`.

---

## 6. Recipes

### 6.1 Onboard a new paying tenant

1. User clicks "Open TradeFlowKit" in OperatorOS. Hub mints a JWT with
   `aud=tradeflowkit`, includes the tenant's `organizationId` in the
   consume response.
2. TradeFlowKit auto-provisions the org, user becomes `owner`, redirect
   `/dashboard?sso=provisioned`.
3. Hub immediately calls push-sync to set the plan + features:

   ```http
   POST /api/operatoros/entitlements/sync
   Authorization: Bearer …
   {
     "tenantId": "tnt_abc123",
     "planSlug": "pro",
     "subscriptionStatus": "active",
     "accessLevel": "full"
   }
   ```

### 6.2 Add another seat to an existing tenant

After the new user finishes their first SSO launch:

```json
{
  "tenantId": "tnt_abc123",
  "members": [
    { "operatorosUserId": "u_999", "moduleRole": "module_user", "enabled": true }
  ]
}
```

If you push this before the user has launched, the row won't exist yet
and the response will show `memberSkipped: 1`. Retry after their first
launch.

### 6.3 Grant a single off-plan feature

Pro tenants don't get `call_recovery` by default. To enable it for one
tenant without upgrading their plan:

```json
{
  "tenantId": "tnt_abc123",
  "features": { "call_recovery": true }
}
```

To revert it later, push `false` (NOT `null`):

```json
{ "tenantId": "tnt_abc123", "features": { "call_recovery": false } }
```

### 6.4 Suspend a tenant (payment dispute / fraud)

```json
{ "tenantId": "tnt_abc123", "accessLevel": "revoked" }
```

Every user in the tenant is bumped to the AccessDenied screen on their
next request. To restore, push `accessLevel: "full"`.

### 6.5 Revoke one user

```json
{
  "tenantId": "tnt_abc123",
  "members": [
    { "operatorosUserId": "u_999", "enabled": false }
  ]
}
```

### 6.6 Downgrade plan

```json
{
  "tenantId": "tnt_abc123",
  "planSlug": "starter",
  "subscriptionStatus": "active"
}
```

This shifts feature defaults to `starter`. Any explicit overrides still
on the snapshot survive — clear them explicitly if you want a fresh
slate:

```json
{
  "tenantId": "tnt_abc123",
  "planSlug": "starter",
  "features": {
    "automations": false, "recurring_jobs": false, "team_invites": false,
    "accounting_export": false, "recurring_invoices": false,
    "call_recovery": false, "audit_log": false
  }
}
```

---

## 7. Behavioural guarantees

- **Single chokepoint.** Every plan / feature gate in TradeFlowKit
  reads from one resolver function. Linked tenants always defer to the
  hub's snapshots; non-linked tenants use the legacy local plan model.
  The hub cannot accidentally end up in a half-applied state.
- **Tenant ≠ user.** Tenant-level features come from the tenant
  snapshot ONLY. A member's snapshot can narrow what that user does,
  but never widen what their tenant has paid for. (E.g. a `module_user`
  on a `starter` plan cannot somehow access `automations`.)
- **Fail closed.** Missing / malformed snapshots on linked tenants
  resolve to denied with explicit reasons (`tenant_inactive`,
  `user_disabled`, `no_module_role`, `feature_not_in_plan`,
  `plan_limit_reached`). There is no permissive default branch.
- **Stripe is off for linked tenants.** Linked-tenant users see
  read-only billing UI and `/api/billing/create-checkout-session` /
  `/api/billing/create-portal-session` return `410
  managed_by_operatoros`. Non-linked tenants keep the full Stripe flow.
- **Owners are sacred.** Local owners cannot be demoted by SSO or
  push-sync; the hub revokes their access via `enabled: false` or
  tenant `accessLevel`.
- **Background workers honor entitlements.** The reminder worker (SMS
  follow-ups, recurring invoices) consults the same resolver for
  linked tenants, so revoking `automations` from the hub stops the
  next background run within 30 minutes.
- **Members-only syncs are safe.** Calling sync with just a `members`
  array never clobbers the tenant snapshot, so you can fan out per-user
  updates without re-asserting plan data.

---

## 8. Where to look on the TradeFlowKit side

For deeper detail, the canonical source files are:

| File | Contains |
|------|----------|
| `docs/OPERATOROS_SSO_DESTINATION.md` | Full SSO destination spec (validation order, reject codes, manual test checklist). |
| `shared/entitlements.ts` | `FEATURE_KEYS`, `deriveDefaultsFromPlanSlug`, `resolveAccess`, `tenantHasFeature`. |
| `server/routes/sso.ts` | `/sso` receiver implementation. |
| `server/routes/entitlements.ts` | `/api/operatoros/entitlements/sync` implementation. |
| `tests/entitlements.test.ts` | Worked examples of grant / revoke / override semantics, plus the security invariants the resolver enforces. |
| `tests/sso-route.test.ts` | Worked examples of every SSO redirect outcome, identity refresh, and cross-tenant isolation guarantees. |

If something in this guide disagrees with the code, the code wins —
open a ticket against TradeFlowKit and we'll update the doc.
