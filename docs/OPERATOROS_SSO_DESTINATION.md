# OperatorOS SSO Destination

TradeFlowKit accepts users launched from **OperatorOS** (Shotgun OS) using a
short-lived signed handoff token. This document describes the destination-side
receiver, its configuration, the validation order, and a manual test
checklist.

This receiver is **purely additive**. It does not change the existing
username/password sign-in, 2FA, organization switching, or session machinery.

---

## Endpoints

### `GET /sso?token=<jwt>`

Public endpoint. On success it starts a TradeFlowKit session and redirects to
`/dashboard`. On any failure it renders a clean HTML error page (no JSON, no
stack traces, no token contents echoed back).

The endpoint is rate-limited the same way as `/api/auth/login`.

---

## Configuration

The receiver reads the following environment variables (managed in the Replit
Secrets / Env panel — never committed):

| Name | Required | Description |
|------|----------|-------------|
| `MODULE_SSO_SECRET` | Yes (for SSO) | Shared HS256 signing secret with OperatorOS. |
| `OPERATOROS_BASE_URL` | Yes (for SSO) | Base URL of OperatorOS, e.g. `https://operatoros.example.com`. Used both as the expected `iss` claim and as the host for the consume call. Trailing slashes are stripped. |
| `APP_ENV` | Optional | Expected `env` claim (e.g. `production`, `staging`). Defaults to `NODE_ENV`. |
| `MODULE_SLUG` | Optional | Expected `aud` and `module_slug` claim. Defaults to `tradeflowkit`. |

If `MODULE_SSO_SECRET` or `OPERATOROS_BASE_URL` is unset, the `/sso` endpoint
responds with a clean "Sign-in is not configured" page (HTTP 503). The rest of
the app continues to work normally.

`MODULE_SSO_SECRET` is server-only — it is never sent to the browser, never
logged, and never echoed in any response.

---

## Token shape

The handoff token is a JWT signed with HS256.

**Required header:**

```json
{ "alg": "HS256" }
```

`typ` is optional and not validated.

**Required claims:**

| Claim | Type | Description |
|-------|------|-------------|
| `iss` | string | Must equal `OPERATOROS_BASE_URL`. |
| `aud` | string | Must equal `MODULE_SLUG` (default `tradeflowkit`). |
| `module_slug` | string | Must equal `MODULE_SLUG` (default `tradeflowkit`). |
| `env` | string | Must equal `APP_ENV`. |
| `jti` | string | Unique token id, used by the consume call. |
| `email` | string | The user's email address. Used as the stable identity link. |
| `exp` | number | Unix seconds. Must be in the future. |

**Optional claims:**

| Claim | Description |
|-------|-------------|
| `iat` | Issued-at (informational). |
| `name` | Display name used when provisioning a new local user. |
| `user_id` | OperatorOS user id. **Not used as an identity link** — kept for forward compatibility only. |

---

## Validation order

The `/sso` handler performs these checks in this exact order. The first
failure short-circuits with a clean error page; no session is created and no
user is touched.

1. Token is present in the `token` query string.
2. Token has three dot-separated base64url segments.
3. Header `alg === "HS256"`.
4. HMAC-SHA256 signature matches `MODULE_SSO_SECRET` (timing-safe compare).
5. `iss === OPERATOROS_BASE_URL`.
6. `aud === MODULE_SLUG`.
7. `module_slug === MODULE_SLUG`.
8. `env === APP_ENV`.
9. `exp` is a number greater than the current time (in seconds).
10. `jti` is a non-empty string.
11. `email` is a non-empty string.
12. **Consume call** — `POST {OPERATOROS_BASE_URL}/v1/modules/sso/consume`
    with `{ jti, aud, env }` and a 5s timeout. The session is started **only
    if** this returns HTTP 200.

| Consume response | Outcome |
|------------------|---------|
| `200` | Continue: lookup/create user, start session, redirect. |
| `400` | Reject: aud / env mismatch. |
| `404` | Reject: unknown token. |
| `409` | Reject: replay (token already consumed). |
| `410` | Reject: expired. |
| `5xx` / network / timeout | Reject as transient (no session started). |

---

## User provisioning

After consume returns 200:

- Email is normalized (`trim()` + `toLowerCase()`).
- TradeFlowKit looks up an existing user by email
  (case-insensitive). If found, that user is signed in.
- If no user exists, a new local user is created with:
  - `username`: the normalized email (with a short random suffix if that
    username is somehow taken).
  - `password`: a random 32-byte secret hashed with bcrypt — the user cannot
    sign in with username/password until they set one.
  - `fullName`: the `name` claim if present, otherwise the email local-part.
  - `email`: the normalized email.
- Session is started: `req.session.userId = user.id`. If the user already
  belongs to one or more orgs, the first one is set as `req.session.orgId`.
  Otherwise no org is set and the post-login flow handles org creation/joining
  the same way it does for native signups.
- 2FA is **not** re-checked on the SSO path. OperatorOS is the trusted issuer
  of the handoff token; once consume succeeds, the session is started even for
  users who have a TOTP secret configured locally. (Native username/password
  sign-in still enforces 2FA exactly as before — this is purely additive.)

The redirect target is always `/dashboard`.

---

## Logging

Every SSO attempt logs a single structured line under `component: "sso"`:

| Outcome | Fields |
|---------|--------|
| `success` | `jti`, `userId`, `email`, `provisioned`, `hasOrg` |
| `verify_failed` | `reason` (`missing_token` / `bad_signature` / `expired` / …) |
| `consume_failed` | `reason` (`replay` / `unknown` / `expired` / `mismatch` / `transient`), `jti` |
| `not_configured` | — |
| `ambiguous_email` | `jti`, `email` |
| `session_failed` | `jti`, `userId` |
| `internal_error` | `jti`, `err` |

The raw token, the `MODULE_SSO_SECRET`, and the issuer URL are **never**
logged.

---

## Manual test checklist

Run against a TradeFlowKit instance with `MODULE_SSO_SECRET`,
`OPERATOROS_BASE_URL`, `APP_ENV`, and (optionally) `MODULE_SLUG` set.

- [ ] **Valid OperatorOS launch** — Issue a fresh token from OperatorOS for
      an existing email, click the link → lands on `/dashboard` signed in as
      that user, no second login required.
- [ ] **Replay** — Use the same `?token=` URL a second time → "This sign-in
      link has already been used" page (HTTP 409). No session created.
- [ ] **Wrong audience** — Issue a token with `aud: "techdeck"` → "Sign-in
      link is for a different app" page (HTTP 400).
- [ ] **Wrong environment** — Issue a token with `env: "staging"` while the
      server has `APP_ENV=production` → "Sign-in link is for the wrong
      environment" page (HTTP 400).
- [ ] **Expired token** — Issue a token with `exp` in the past → "Sign-in
      link has expired" page (HTTP 410).
- [ ] **Bad signature** — Tamper with one character of the JWT signature →
      "Sign-in link could not be verified" page (HTTP 401).
- [ ] **Missing token** — Visit `/sso` with no query string → "Sign-in link
      is missing" page (HTTP 400), no stack trace.
- [ ] **Existing-email reuse** — A user with `email = alice@example.com`
      already exists; an SSO launch for `Alice@Example.com` reuses that user
      (no duplicate created).
- [ ] **New-email provisioning** — An SSO launch for an email not in the DB
      creates exactly one new user, signs them in, and lands them on
      `/dashboard`. Their post-login UX matches a brand-new native signup
      (no org until they create or join one).
- [ ] **Not configured** — Unset `MODULE_SSO_SECRET`, restart, hit `/sso?token=…`
      → "Sign-in is not configured" page (HTTP 503). Native login still
      works.
- [ ] **Logs** — `grep '"component":"sso"'` on the server log shows one line
      per attempt with the correct outcome and never contains the raw token
      or secret.

---

## Security notes

- `MODULE_SSO_SECRET` is server-side only; the browser bundle never receives
  it.
- Email is the stable identity link. The OperatorOS `user_id` is intentionally
  ignored when matching local users.
- `consume` is called **before** any session is started or any user is
  created, so a token must exist on the issuer side and not have been used
  before TradeFlowKit will trust it.
- HS256 signature comparison is timing-safe.
- `/sso` is rate-limited the same way as `/api/auth/login` (10 requests per
  15 minutes per IP in production).
