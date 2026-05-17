# OperatorOS SSO Destination

TradeFlowKit accepts users launched from **OperatorOS** (Shotgun OS) using a
short-lived signed handoff token. This document describes the destination-side
receiver as built to the canonical *OperatorOS Child-App SSO Integration*
contract that all Shotgun Ninjas child apps share.

This receiver is **purely additive**. It does not change the existing
username/password sign-in, 2FA, organization switching, or session machinery.

---

## Endpoint

### `GET /sso?token=<jwt>`

Public endpoint. On success it starts a TradeFlowKit session and redirects to
`/dashboard`. On any failure it responds with the canonical reject code:

- **HTML** (default — for browser launches): a clean error page that includes
  the canonical reject code as the reference string.
- **JSON** (when `Accept: application/json` is sent and HTML isn't preferred):
  `{ "code": "<reject_code>" }` with the matching HTTP status from the table
  below.

The endpoint is rate-limited the same way as `/api/auth/login`.

---

## Configuration

The receiver reads the following environment variables (managed in the Replit
Secrets / Env panel — never committed):

| Name | Required | Description |
|------|----------|-------------|
| `MODULE_SSO_SECRET` | Yes | Shared HS256 signing secret with OperatorOS. ≥16 characters. |
| `OPERATOROS_BASE_URL` | Yes | Expected `iss` claim, e.g. `https://app.operatoros.com`. Trailing slashes are stripped. |
| `OPERATOROS_SSO_AUDIENCE` | Yes | Expected `aud` and `module_slug` claims. For TradeFlowKit: `tradeflowkit` (lowercase). |
| `OPERATOROS_SSO_ENV` | Yes | Expected `env` claim. One of `prod`, `staging`, `dev`. |
| `OPERATOROS_API_URL` | Optional | Host to POST `/v1/modules/sso/consume` against. Defaults to `OPERATOROS_BASE_URL` when unset (the canonical doc says "typically same host as iss"). |

**Production**: at startup, all four required SSO env vars are checked, and
`MODULE_SSO_SECRET` must be at least 16 characters. If anything is missing or
too short, the process will **fail to start** with a loud error listing the
offending vars. This implements the contract's "fail startup loudly" rule.

**Development / test**: the app boots even without SSO env vars. The `/sso`
endpoint then responds with a clean "Sign-in is not configured" page (HTTP 503,
reject code `not_configured`) until the operator sets the required secrets and
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
| `sub` | string (uuid) | OperatorOS user id — local user records are keyed on this. |
| `user_id` | string (uuid) | Duplicate of `sub` per the contract. Either may be present; `sub` wins. |
| `email` | string | Stored on the local user (lowercased, trimmed). |
| `role` | string | Stored as `users.operatorosRole` (e.g. `user`, `super_admin`). |
| `plan_slug` | string \| null | Stored as `users.operatorosPlanSlug` (e.g. `starter`, `pro`, `elite`, or `null`). |
| `organization_id` | string \| null | Stored as `users.operatorosOrganizationId` (active OperatorOS tenant). |
| `jti` | string (hex) | Single-use token id; used by the consume call. |
| `iat` | number (seconds) | Issued-at. Must not be more than 5 s in the future. |
| `exp` | number (seconds) | `iat + 90`. Must be in the future. |

**TTL**: 90 seconds. Tokens older than that (`now − iat > 90`) are rejected as
`expired` even if `exp` hasn't passed yet.

**Clock skew**: `iat` may be up to 5 seconds in the future; beyond that we
reject with `clock_skew`.

---

## Validation order (server-side)

1. Read `?token=...`. Missing → `missing_token`.
2. Parse JWT. Malformed → `bad_request`.
3. Verify `alg === "HS256"` and signature with `MODULE_SSO_SECRET`. Failures
   → `signature_invalid` (rejects `alg=none` and any RS256/asymmetric token).
4. Verify `iss === OPERATOROS_BASE_URL` → `issuer_mismatch`.
5. Verify `aud === OPERATOROS_SSO_AUDIENCE` and `module_slug === audience`
   → `audience_mismatch`.
6. Verify `env === OPERATOROS_SSO_ENV` → `env_mismatch`.
7. Verify `iat` ≤ `now + 5` → `clock_skew`.
8. Verify `exp > now` and `now − iat ≤ 90` → `expired`.
9. Verify `jti`, `email`, and (`sub` or `user_id`) are non-empty strings →
   `bad_request`.
10. **Mandatory**: `POST {OPERATOROS_API_URL}/v1/modules/sso/consume` with body
    `{ "jti": "...", "aud": "...", "env": "..." }`. Map the response per the
    table below. Network errors and 5xx fail closed.
11. On success: look up the local user by `sub`; if absent, fall back to
    looking up by email and backfill `sub` onto the existing record; if still
    absent, lazily provision a new user with the OperatorOS attributes.
12. Refresh `email`, `role`, `plan_slug`, `organization_id` on the local user
    record from the token.
13. Issue a TradeFlowKit session cookie and redirect to `/dashboard`.

The JWT is **never** copied into our session. The session cookie is the
existing TradeFlowKit cookie issued by `express-session`.

---

## Reject code reference

All canonical reject codes are returned as the JSON `code` field (when JSON is
preferred) and as the reference string on the HTML error page (when HTML is
preferred — the normal browser launch case).

| HTTP | `code` | When |
|------|--------|------|
| 400 | `missing_token` | `?token=` absent |
| 400 | `bad_request` | malformed JWT, missing required claim |
| 401 | `signature_invalid` | HS256 verify failed (or `alg=none` / asymmetric) |
| 401 | `issuer_mismatch` | `iss` is not `OPERATOROS_BASE_URL` |
| 401 | `audience_mismatch` | `aud` ≠ `OPERATOROS_SSO_AUDIENCE` (or consume said so) |
| 401 | `env_mismatch` | `env` ≠ `OPERATOROS_SSO_ENV` (or consume said so) |
| 401 | `expired` | `exp` in the past, or `iat` older than 90 s, or consume said `TOKEN_EXPIRED` |
| 401 | `clock_skew` | `iat` more than 5 s in the future |
| 401 | `consume_failed` | `/v1/modules/sso/consume` returned a 4xx not otherwise carved out |
| 502 | `sso_consume_unavailable` | `/v1/modules/sso/consume` returned 5xx or the network call failed |

Two local-only outcomes are also possible (not part of the wire contract):

| HTTP | `code` | When |
|------|--------|------|
| 503 | `not_configured` | `MODULE_SSO_SECRET` / `OPERATOROS_BASE_URL` / audience / env are unset (dev only) |
| 500 | `session` / `internal` | Session save failed or unexpected exception while signing the user in |

### Mapping from the consume API → child reject codes

The OperatorOS API's `/v1/modules/sso/consume` returns these `code` values in
the JSON body of non-2xx responses. They are mapped 1:1 per the contract:

| API HTTP | API `code` | Child reject |
|----------|------------|--------------|
| 404 | `TOKEN_UNKNOWN` | `consume_failed` |
| 409 | `TOKEN_REPLAYED` | `consume_failed` |
| 410 | `TOKEN_EXPIRED` | `expired` |
| 400 | `AUDIENCE_MISMATCH` | `audience_mismatch` |
| 400 | `ENV_MISMATCH` | `env_mismatch` |
| 5xx / network | — | `sso_consume_unavailable` |

---

## Identity model

Local user records are keyed on the OperatorOS `sub` (UUID). The first
successful launch for a `sub` provisions a new TradeFlowKit user with:

- `username`: derived from the email (with a random suffix on collision)
- `password`: a random 32-byte value (the user can never sign in with it —
  they always come back through OperatorOS)
- `fullName`: `claims.name` if present, else the email's local part
- `email`: lowercased, trimmed
- `isSsoProvisioned: true`
- `operatorosUserId`: the `sub`
- `operatorosRole`, `operatorosPlanSlug`, `operatorosOrganizationId`: from the
  token (refreshed on every subsequent successful launch)

**Backfill**: users provisioned by the original task #66 implementation were
keyed on email and have no `operatorosUserId` yet. On first launch under the
new contract, we look them up by email and write the `sub` onto the existing
record so subsequent launches go through the sub-keyed path.

### Role mapping (OperatorOS → TradeFlowKit)

For users that arrived through `/sso` (i.e. have an `operatorosUserId`),
OperatorOS owns the platform-level role. On every successful launch we mirror
the token's `role` claim onto `users.isSuperAdmin`:

| Token `role` | `users.isSuperAdmin` |
|--------------|----------------------|
| `super_admin` | `true` (master-admin panel + `requireSuperAdmin` allowed) |
| anything else (`user`, missing, etc.) | `false` |

Conflict rule: **OperatorOS wins for SSO-bound users.** If an operator
manually flipped `isSuperAdmin` in the database for a user that later signs in
through OperatorOS as a non-`super_admin`, the next `/sso` launch will revoke
the flag. To grant or remove super-admin durably for an SSO user, change the
role in OperatorOS — that is the source of truth.

Users that have **never** signed in through OperatorOS (no `operatorosUserId`)
are unaffected; their `isSuperAdmin` is whatever the local database says.

`users.operatorosRole` is still also stored verbatim from the token for
auditing and for any future role values OperatorOS introduces.

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
per-org TradeFlowKit plan, so all `PLAN_LIMITS`, `requireSuperAdmin`-adjacent
plan gates, automations, recurring jobs, exports, etc. continue to read from
`orgs.plan` and ignore `users.operatorosPlanSlug`. The slug remains stored on
the user for visibility and possible future use.

---

## Listing a user's organizations

After a user has signed in through `/sso` at least once (so we have their
OperatorOS `sub` stored as `users.operatorosUserId`), TradeFlowKit can ask
OperatorOS which organizations that user belongs to. This powers the "pick
from your OperatorOS organizations" picker in `/settings#organization`.

### Outbound request

```
GET {OPERATOROS_API_URL}/v1/modules/users/{sub}/organizations
Accept: application/json
Authorization: Bearer {MODULE_SSO_SECRET}
X-Module-Slug: {OPERATOROS_SSO_AUDIENCE}
X-Module-Env: {OPERATOROS_SSO_ENV}
```

- `{sub}` is the URL-encoded OperatorOS user id (`users.operatorosUserId`).
- Auth scheme is the same shared HS256 secret used for
  `/v1/modules/sso/consume`. It is server-only and never reaches the browser.
- The call has a **5 second** timeout; on timeout/network failure we surface
  `{ available: false, reason: "unavailable" }` to the client (we do not
  throw).
- No query parameters. No request body.

### Success response (HTTP 200)

The response body MUST be a JSON object with a single `organizations` array.
Each entry MUST have a non-empty string `id` and a non-empty string `name`:

```json
{
  "organizations": [
    { "id": "ae1f-uuid", "name": "Acme Electric" },
    { "id": "b220-uuid", "name": "Bravo HVAC" }
  ]
}
```

- `id` is the OperatorOS organization id and is what gets written to
  `users.operatorosOrganizationId` / `orgs.operatorosOrganizationId` when
  the user links a TradeFlowKit org to it.
- `name` is the human-readable label shown in the picker.
- Entries with a missing/empty `id` or `name` are dropped by the child.
- An empty `organizations: []` array is valid and means "user has no
  OperatorOS organizations" — the picker shows an empty state.
- Any extra keys (per-entry or top-level) are ignored.

### Error responses

| API HTTP | Meaning | Child surfaces |
|----------|---------|----------------|
| 200, well-formed body | Success | `{ available: true, organizations: [...] }` |
| 200, body is not the documented shape | Treated as upstream bug | `{ available: false, reason: "unavailable" }` (logged) |
| 401 / 403 | Bad/expired `MODULE_SSO_SECRET`, wrong slug/env | `{ available: false, reason: "unavailable" }` (logged with status) |
| 404 | Unknown `sub` | `{ available: false, reason: "unavailable" }` (logged with status) |
| 5xx / network / timeout | Upstream unavailable | `{ available: false, reason: "unavailable" }` (logged) |

The child endpoint never throws to the browser — the picker degrades to a
manual "enter organization id" input whenever the response is anything other
than a well-formed 200.

### Local-only response shapes

The child endpoint `GET /api/operatoros/organizations` also returns two
local-only outcomes that do not involve an upstream call:

| `reason` | When |
|----------|------|
| `not_configured` | SSO env vars are unset (dev only). |
| `not_linked` | The current user has no `operatorosUserId` (they have never come through `/sso`). |

---

## What's intentionally out of scope

- JWKS / RS256 — the contract is shared HS256, rotated by changing
  `MODULE_SSO_SECRET` everywhere at once.
- Refresh tokens — re-launch from OperatorOS to get a new session.
- SCIM / directory sync — users are lazily provisioned on first successful
  `/sso` call.
- Auto-creating a TradeFlowKit org from `organization_id` — users with no
  TradeFlowKit org still land on the normal "create or join" flow.

---

## Manual test checklist

Set `MODULE_SSO_SECRET`, `OPERATOROS_BASE_URL`, `OPERATOROS_SSO_AUDIENCE`,
`OPERATOROS_SSO_ENV`, and (optionally) `OPERATOROS_API_URL`. Restart the
workflow.

1. Visit `/` — the app loads normally; no SSO involvement.
2. Visit `/sso` (no token) → 400 `missing_token` page.
3. Visit `/sso` with a tampered token → 401 `signature_invalid` page; no
   consume call should appear in OperatorOS logs.
4. Issue a real token from OperatorOS and visit `/sso?token=...` → 302 to
   `/dashboard`, session started, `users.operatorosUserId` set.
5. Replay the same token → consume returns `TOKEN_REPLAYED`; we render
   `consume_failed` and do not start a new session.
6. Issue a token, wait 91 seconds, then visit `/sso?token=...` → 401
   `expired`.
7. Issue a token from a different audience (e.g. `techdeck`) → 401
   `audience_mismatch`.
8. Curl `/sso` with `Accept: application/json` → JSON `{ "code": "..." }`
   body with the matching HTTP status.
