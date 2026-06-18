# OperatorOS SSO Destination

TradeFlowKit accepts users launched from **OperatorOS** (Shotgun OS) using a
short-lived signed handoff token. This document describes the destination-side
receiver as built to the canonical **OperatorOS Child-App SSO Integration**
contract that all Shotgun Ninjas child apps share.

This receiver is **purely additive**. It does not change the existing
username/password sign-in, 2FA, organization switching, or session machinery.

---

## Endpoint

### `GET /sso?token=<jwt>`

Public endpoint. On success it starts a TradeFlowKit session and redirects to
`/dashboard`. On any **canonical** failure it **redirects back to the
OperatorOS hub** with the reject code in the `launchError` query parameter —
e.g. `https://operatoros.net/?launchError=bad_signature`. The hub then renders
the launch error to the operator. The child does not render its own error UI
for these cases.

The single exception is when the consume API itself is unavailable (5xx /
network failure): the child responds with `502 sso_consume_unavailable`
(plain-text body) rather than redirecting, since the hub may also be down.

Local-only outcomes (not part of the wire contract) still render a clean
HTML error card:

| HTTP | Outcome | When |
|------|---------|------|
| 503 | `not_configured` | SSO env vars are unset (dev only) |
| 500 | `session` / `internal` | Session save failed or unexpected exception |

---

## Configuration

The receiver reads the following environment variables (managed in the Replit
Secrets / Env panel — never committed):

| Name | Required | Description |
|------|----------|-------------|
| `MODULE_SSO_SECRET` | Yes | Shared HS256 signing secret with OperatorOS. ≥16 characters. |
| `OPERATOROS_BASE_URL` | Yes | Expected `iss` claim, e.g. `https://operatoros.net`. Also where canonical failures redirect to (`{base}/?launchError=<code>`). Trailing slashes are stripped. |
| `OPERATOROS_SSO_AUDIENCE` | Yes | Expected `aud` and `module_slug` claims. For TradeFlowKit: `tradeflowkit` (lowercase). |
| `OPERATOROS_SSO_ENV` | Yes | Expected `env` claim. One of `prod`, `staging`, `dev`. |
| `OPERATOROS_API_URL` | Optional | API base for the consume call. Per the canonical contract this is `https://operatoros.net/api` (the hub's front door rewrites `/api/:path*` to internal Fastify routes). Defaults to `OPERATOROS_BASE_URL` when unset. |

**Production**: at startup, all four required SSO env vars are checked, and
`MODULE_SSO_SECRET` must be at least 16 characters. If anything is missing or
too short, the process will **fail to start** with a loud error listing the
offending vars. This implements the contract's "fail startup loudly" rule.

**Development / test**: the app boots even without SSO env vars. The `/sso`
endpoint then responds with a clean "Sign-in is not configured" page (HTTP 503,
local code `not_configured`) until the operator sets the required secrets and
restarts the workflow. The rest of the app keeps working normally.

`MODULE_SSO_SECRET` is server-only — it is never sent to the browser, never
logged, and never echoed in any response. Logs reference the `jti` only.

### Legacy aliases

For backward compatibility with deployments running the original task #66
implementation, two legacy env names are still accepted:

- `MODULE_SLUG` → falls back into `OPERATOROS_SSO_AUDIENCE`.
- `APP_ENV` → translated into `OPERATOROS_SSO_ENV` (`production`/`prod` →
  `prod`, `staging`/`stage` → `staging`, `development`/`dev` → `dev`). Any
  other value (including `test`) is rejected — set `OPERATOROS_SSO_ENV`
  explicitly instead.

New deployments should set the canonical names directly.

---

## Token shape (HS256)

Header: `{ "alg": "HS256", "typ": "JWT" }`

| Claim | Type | Notes |
|-------|------|-------|
| `iss` | string | Must match `OPERATOROS_BASE_URL` exactly. |
| `aud` | string | Must equal `OPERATOROS_SSO_AUDIENCE` (lowercase). |
| `module_slug` | string | Must equal `aud`. |
| `env` | `prod` \| `staging` \| `dev` | Must match `OPERATOROS_SSO_ENV`. |
| `jti` | string | Single-use token id; spent by the consume call. |
| `iat` | number (seconds) | Issued-at. |
| `exp` | number (seconds) | Typically `iat + 90`. |
| `sub` | string (optional) | OperatorOS user id. Stored for audit/tracking; **not** used as the identity key — see "Identity model" below. |

**TTL**: 90 seconds with a ±5 second clock-skew window — effective ceiling
of 95 s on `now - iat`. Tokens older than that are rejected as `token_expired`
even if `exp` hasn't passed yet.

The identity, email, name, role, plan slug, and organization id all come
from the **consume response**, NOT the JWT. The JWT is the handoff — the
consume call is the authoritative userinfo source.

---

## Validation order (server-side)

1. Read `?token=...`. Missing → `no_token`.
2. Parse JWT. Malformed / unsupported `alg` / bad HMAC / missing structural
   claims (`jti`, `iat`, `exp`) → `bad_signature`.
3. Verify `iss === OPERATOROS_BASE_URL` → `bad_issuer`.
4. Verify `aud === OPERATOROS_SSO_AUDIENCE` and `module_slug === aud` →
   `bad_module_slug`.
5. Verify `env === OPERATOROS_SSO_ENV` → `env_mismatch`.
6. Verify `exp > now` and `now − iat ≤ 95` → `token_expired`.
7. **Mandatory**: `POST {OPERATOROS_API_URL}/modules/sso/consume` with body
   `{ "jti": "...", "aud": "...", "env": "..." }` and **no auth header**
   (the single-use `jti` is the auth). The 200 response IS the userinfo.
8. On non-200 4xx: forward the upstream `code` verbatim as `launchError`,
   defaulting to `consume_failed` when no code is provided.
9. On 5xx / network failure: respond `502 sso_consume_unavailable`
   (plain text body, NOT a hub redirect).
10. On 200 well-formed body: look up the local user by `payload.user.email`
    (lowercased, trimmed). If absent, lazily provision a new user with the
    consume payload's attributes. On every launch, refresh
    `operatorosUserId`, `operatorosRole`, `operatorosPlanSlug`,
    `operatorosOrganizationId`, and `isSuperAdmin` from the payload.
11. Issue a TradeFlowKit session cookie and redirect to `/dashboard`.

The JWT is **never** copied into our session. The session cookie is the
existing TradeFlowKit cookie issued by `express-session`.

---

## Consume call shape

### Request

```
POST {OPERATOROS_API_URL}/modules/sso/consume
content-type: application/json

{ "jti": "...", "aud": "tradeflowkit", "env": "prod" }
```

No `Authorization` header. No `X-Module-*` headers. Five second timeout.

### Success body (HTTP 200)

```json
{
  "ok": true,
  "user": { "id": "u_…", "email": "alice@example.com", "name": "Alice", "role": "user" },
  "moduleSlug": "tradeflowkit",
  "planSlug": "starter",
  "organizationId": null,
  "env": "prod",
  "jti": "…",
  "issuer": "https://operatoros.net",
  "accessSource": "plan"
}
```

`organizationId` is documented as currently always `null` — the
auto-join / auto-provision code path stays in the receiver for forward
compatibility but does not trigger today.

### Error bodies

Non-2xx responses carry `{ "code": "<STRING>" }`. The child forwards
`code` verbatim into `launchError`.

| API HTTP | Typical API `code` | Child behavior |
|----------|--------------------|----------------|
| 404 | `TOKEN_UNKNOWN` | redirect with `launchError=TOKEN_UNKNOWN` |
| 409 | `TOKEN_REPLAYED` | redirect with `launchError=TOKEN_REPLAYED` |
| 410 | `TOKEN_EXPIRED` | redirect with `launchError=TOKEN_EXPIRED` |
| 400 | `AUDIENCE_MISMATCH` | redirect with `launchError=AUDIENCE_MISMATCH` |
| 400 | `ENV_MISMATCH` | redirect with `launchError=ENV_MISMATCH` |
| 4xx | (missing) | redirect with `launchError=consume_failed` |
| 5xx / network | — | 502 `sso_consume_unavailable` (plain text, no redirect) |

---

## Reject code reference (canonical)

These appear verbatim in the `launchError` query parameter on the hub
redirect.

| Code | When |
|------|------|
| `no_token` | `?token=` absent. |
| `bad_signature` | HS256 verify failed, `alg=none`, malformed JWT, or missing structural claim (`jti` / `iat` / `exp`). |
| `bad_issuer` | `iss` is not `OPERATOROS_BASE_URL`. |
| `bad_module_slug` | `aud` ≠ `OPERATOROS_SSO_AUDIENCE`, or `module_slug` ≠ `aud`. |
| `env_mismatch` | `env` ≠ `OPERATOROS_SSO_ENV`. |
| `token_expired` | `exp` in the past, or token age > 95 s (90 + 5 skew). |
| `consume_failed` | Consume 4xx without an upstream `code`. (The hub also sees upstream codes like `TOKEN_REPLAYED` / `TOKEN_EXPIRED` forwarded verbatim.) |
| `sso_consume_unavailable` | Consume 5xx or network failure. Surfaced as a 502 with a plain-text body — **not** redirected to the hub, since the hub itself may be unreachable. |

---

## Identity model

Local user records are keyed on **email** (`payload.user.email`,
lowercased and trimmed). The first successful launch for an email provisions
a new TradeFlowKit user with:

- `username`: derived from the email (with a random suffix on collision)
- `password`: a random 32-byte value (the user can never sign in with it —
  they always come back through OperatorOS)
- `fullName`: `payload.user.name` if present, else the email's local part
- `email`: lowercased, trimmed
- `isSsoProvisioned: true`
- `operatorosUserId`: stored from `payload.user.id` for audit / tracking
- `operatorosRole`, `operatorosPlanSlug`, `operatorosOrganizationId`:
  from the payload (refreshed on every subsequent successful launch)

Pre-existing users discovered by email (whether provisioned locally or by an
earlier sub-keyed SSO implementation) keep their existing row and have these
attributes back-filled / refreshed on the next launch. Email is the stable
join key.

### Role mapping (OperatorOS → TradeFlowKit)

OperatorOS owns the platform-level role for any user that signs in through
`/sso`. On every successful launch we mirror `payload.user.role` onto
`users.isSuperAdmin`:

| Payload `role` | `users.isSuperAdmin` |
|----------------|----------------------|
| `super_admin` | `true` (master-admin panel + `requireSuperAdmin` allowed) |
| anything else (`user`, missing, etc.) | `false` |

Conflict rule: **OperatorOS wins for SSO-bound users.** If an operator
manually flipped `isSuperAdmin` in the database for a user that later signs in
through OperatorOS as a non-`super_admin`, the next `/sso` launch will revoke
the flag. To grant or remove super-admin durably for an SSO user, change the
role in OperatorOS — that is the source of truth.

Users that have **never** signed in through OperatorOS are unaffected; their
`isSuperAdmin` is whatever the local database says.

### Plan slug mapping (intentionally independent)

`users.operatorosPlanSlug` (e.g. `starter`, `pro`, `elite`, `null`) is stored
on the user but is **not** mapped into TradeFlowKit's plan-gate checks. The
two systems intentionally stay independent:

- TradeFlowKit's plan tiers (`free`, `individual`, `small_business`,
  `enterprise`) are **per-organization** and drive Stripe billing for that
  org. Multiple users with different OperatorOS plan slugs can share one
  TradeFlowKit org, and one user can belong to multiple TradeFlowKit orgs on
  different tiers.
- OperatorOS's `plan_slug` is **per-user** and reflects the user's standing
  in the OperatorOS ecosystem.

There is no clean 1:1 mapping between a per-user OperatorOS plan and a
per-org TradeFlowKit plan, so all `PLAN_LIMITS`, plan gates, automations,
recurring jobs, exports, etc. continue to read from `orgs.plan` and ignore
`users.operatorosPlanSlug`. The slug remains stored on the user for
visibility and possible future use.

### Auto-join / auto-provision (driven by consume `organizationId`)

When `payload.organizationId` is non-null (currently never the case per the
contract, but the code path is ready for when the hub starts populating it):

- If a TradeFlowKit org already has `orgs.operatorosOrganizationId` set to
  that value, the user is added to that org as `admin` (or `tech` / `viewer`
  depending on `payload.user.role`). Redirect: `/dashboard?sso=joined`.
- If no such linked org exists AND the user has zero TradeFlowKit orgs, a
  new org is provisioned, linked to that `organizationId`, with the user as
  `owner`. Redirect: `/dashboard?sso=provisioned`.
- If a linked org exists and the user is already a member, no membership
  change. Redirect: `/dashboard?sso=signed_in`.

When `payload.organizationId` is null (the standard case today), the user
lands on `/dashboard` and uses the normal "create or join" flow.

---

## Listing a user's organizations

The canonical contract does **not** define a user-organizations endpoint on
the hub. The local child endpoint
`GET /api/operatoros/organizations` is preserved so the existing settings
picker can call it, but it always returns:

```json
{ "available": false, "reason": "unavailable" }
```

The settings UI degrades to its manual "enter organization id" input.

---

## Per-feature entitlement overrides (push-sync)

The push-sync endpoint at `POST /api/operatoros/entitlements/sync` lets
OperatorOS flip **individual** feature bits on a single linked tenant
without shipping a new plan tier. This is how the hub grants a one-off
feature to a customer (e.g. enable `call_recovery` for a `pro`-plan
tenant) or revokes one (e.g. disable `accounting_export` for a `pro`
tenant pending an investigation).

### Accepted feature keys

The `features` field on the sync body accepts any subset of the canonical
TradeFlowKit feature keys (`shared/entitlements.ts` → `FEATURE_KEYS`):

| Key | What it gates |
|-----|---------------|
| `automations` | SMS follow-ups + reminders |
| `recurring_jobs` | Recurring job schedules |
| `analytics` | Business analytics page |
| `team_invites` | Inviting additional members (also pulls `limits.teamMembers`) |
| `unlimited_entities` | Removes the per-resource caps in `limits` |
| `call_recovery` | Call Recovery AI module |
| `audit_log` | Audit-log read API + UI |
| `accounting_export` | QuickBooks / Xero CSV export |
| `customer_portal` | Tokenised customer portal links |
| `review_requests` | Review-request automations |
| `recurring_invoices` | Recurring invoice schedules |
| `stripe_connect` | Tenant-owned Stripe Connect payouts |

Any key not in this list is rejected with `400 invalid_body`. Values must
be `true` or `false` — `null` is not accepted; **omit** the key instead
to leave it unchanged.

### Precedence

For a linked tenant, the bit returned by `tenantHasFeature(...)` is the
first hit from:

1. The most recently pushed `features[<key>]` value on
   `orgs.entitlementSnapshot`, if explicitly set (`true` or `false`).
2. The plan-slug default from `deriveDefaultsFromPlanSlug(planSlug)`
   for any key the snapshot has never set.
3. `false` (fail-closed) if neither the snapshot nor the plan-slug
   defaults provide a value.

That means an **override always wins over the plan-slug default** —
both when granting (`pro` plan denies `call_recovery`, override sets
`true` → granted) and when revoking (`elite` plan grants
`accounting_export`, override sets `false` → denied). The hub-level
`accessLevel` of `none` / `disabled` / `revoked` short-circuits to deny
regardless of any feature bit.

### Partial-update semantics

The sync endpoint is **partial** at every layer:

- A members-only payload (no `planSlug` / `subscriptionStatus` /
  `accessLevel` / `features` / `limits`) leaves the tenant snapshot
  untouched and only bumps `lastEntitlementSyncAt`.
- A tenant payload that omits a feature key preserves the value already
  on the snapshot. Pass an explicit `true` / `false` to flip a bit, omit
  the key to keep it.
- To return a tenant to its plan-slug defaults for a specific feature,
  the hub must push that key with the value matching
  `deriveDefaultsFromPlanSlug(planSlug).features[key]` — there is no
  "clear override" sentinel.

### Authoritative storage

Snapshots are signed and written atomically by the sync handler; the
denormalised columns on `orgs` (`operatorosPlanSlug`,
`operatorosSubscriptionStatus`, `operatorosAccessLevel`) are only used
as a fallback when no snapshot has been written yet. When the two
disagree, the snapshot wins.

### Example: grant `call_recovery` to a `pro` tenant

```
POST /api/operatoros/entitlements/sync
Authorization: Bearer <OPERATOROS_SERVICE_TOKEN>
content-type: application/json

{
  "tenantId": "tnt_abc",
  "planSlug": "pro",
  "subscriptionStatus": "active",
  "features": { "call_recovery": true }
}
```

### Example: revoke `accounting_export` from an `elite` tenant

```
POST /api/operatoros/entitlements/sync
Authorization: Bearer <OPERATOROS_SERVICE_TOKEN>
content-type: application/json

{
  "tenantId": "tnt_xyz",
  "features": { "accounting_export": false }
}
```

---

## What's intentionally out of scope

- JWKS / RS256 — the contract is shared HS256, rotated by changing
  `MODULE_SSO_SECRET` everywhere at once.
- Refresh tokens — re-launch from OperatorOS to get a new session.
- SCIM / directory sync — users are lazily provisioned on first successful
  `/sso` call.
- A separate userinfo endpoint — the consume response IS the userinfo.

---

## Manual test checklist

Set `MODULE_SSO_SECRET`, `OPERATOROS_BASE_URL`, `OPERATOROS_API_URL`,
`OPERATOROS_SSO_AUDIENCE`, and `OPERATOROS_SSO_ENV`. Restart the workflow.

1. Visit `/` — the app loads normally; no SSO involvement.
2. Visit `/sso` (no token) → 302 to `${OPERATOROS_BASE_URL}/?launchError=no_token`.
3. Visit `/sso` with a tampered token → 302 to `…/?launchError=bad_signature`;
   no consume call should appear in OperatorOS logs.
4. Issue a real token from OperatorOS and visit `/sso?token=...` → 302 to
   `/dashboard`, session started, `users.operatorosUserId` populated from the
   consume response.
5. Replay the same token → consume returns `TOKEN_REPLAYED`; we redirect to
   `…/?launchError=TOKEN_REPLAYED` and do not start a new session.
6. Issue a token, wait 96 seconds, then visit `/sso?token=...` → 302
   `…/?launchError=token_expired`.
7. Issue a token from a different audience (e.g. `techdeck`) → 302
   `…/?launchError=bad_module_slug`.
8. With the hub temporarily unreachable, visit `/sso?token=...` → 502 with
   plain-text body `sso_consume_unavailable` (no redirect).
