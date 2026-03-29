# AimLead security audit — V1 pragmatic pass

## Scope

This pass focuses on practical V1 risks in the current app and API:

- session and cookie handling
- public vs authenticated route behavior
- request hardening
- tenancy and workspace access controls
- operational safety around migrations and local dev defaults

## What is already in good shape

- Authenticated API routes fail closed with `401` or `403`.
- Workspace governance routes check role and membership before mutating access.
- API and auth rate limiting are in place.
- Response errors are normalized and do not leak raw stack traces to clients.
- Public marketing routes no longer trigger authenticated `/api/auth/me` checks on page load.
- Migration runner no longer ships with a hardcoded database password and destructive phases are gated.

## Quick wins implemented in this pass

- Disabled the Express `x-powered-by` header.
- Added `Strict-Transport-Security` on secure requests.
- Added `Cross-Origin-Opener-Policy: same-origin`.
- Added `Cross-Origin-Resource-Policy: same-origin`.
- Kept proxy trust configurable through runtime config instead of hardcoding it globally.

## Highest-priority remaining risks

### P1 — CSRF protection is lightweight, not token-based

Current protection relies on `X-Requested-With` for mutating requests. That is better than nothing, but it is not a full CSRF token flow.

Recommendation for the next pass:

- add an explicit CSRF token or double-submit cookie strategy
- validate `Origin` or `Referer` on mutating cookie-authenticated requests
- keep public event endpoints separated from authenticated mutation flows

### P1 — Legacy auth path still depends on local password storage

The legacy auth path still uses `password_hash` locally. That is acceptable for local/dev fallback, but it should not remain the long-term production path if Supabase Auth is the canonical target.

Recommendation:

- keep Supabase Auth as the production target
- clearly document legacy auth as local/dev-only
- continue removing runtime coupling to legacy-only columns where possible

### P1 — Account and workspace tenancy still need one deeper pass

Workspace member removal is intentionally disabled, which is safer than shipping a broken removal flow, but it means the tenancy model is not fully complete yet.

Recommendation:

- finish the safe member removal flow
- enforce owner-presence guarantees at the DB or service layer consistently
- keep ownership transfer and delete-account flows covered by tests

### P2 — Public routes still store raw IP metadata in local mode

Public demo requests and analytics events persist IP addresses locally. That can be operationally useful, but it increases sensitivity of the stored data.

Recommendation:

- define a retention policy
- consider truncating or hashing IPs if they are only used for abuse control

### P2 — Security headers are improved but not yet a complete browser policy set

The app now sends stronger baseline headers, but there is still no tailored CSP rollout.

Recommendation:

- add a CSP in report-only mode first
- validate Swagger docs, Vite assets, and third-party embeds before enforcing

## Recommended next security sequence

1. Strengthen CSRF for authenticated mutations.
2. Finish the tenancy-safe member removal design.
3. Decide and document the production auth mode explicitly.
4. Add CSP in report-only mode.
5. Add a short operational checklist for env secrets, CORS, and deploy config.
