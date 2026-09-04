# Auth Cookie Phase 1 — Dual Support

Phase 1 adds an explicit web cookie transport without removing the existing
Bearer or refresh-token-body contract.

## Transport selection

Browser auth requests opt in with:

```text
X-Auth-Transport: cookie
```

Native and legacy clients do not need this header and continue to receive and
send the existing Bearer/refresh-token-body contract. The header only selects
cookie issuance when `AUTH_COOKIE_TRANSPORT=on`; it is not an authorization
signal. The flag defaults to `off`, so cookie authentication cannot silently
activate in an existing deployment.

## Cookies

| Cookie                 | Flags                                | Scope        |
| ---------------------- | ------------------------------------ | ------------ |
| `__Host-oku_access`    | `HttpOnly; Secure; SameSite=Lax`     | `Path=/`     |
| `__Secure-oku_refresh` | `HttpOnly; Secure; SameSite=Lax`     | `Path=/auth` |
| `__Host-oku_csrf`      | `Secure; SameSite=Lax`, not HttpOnly | `Path=/`     |

No `Domain` attribute is emitted. Access and refresh cookie lifetimes follow
the generated token expirations. Auth responses are marked `Cache-Control:
no-store`.

## Dual-support rules

- A non-empty `Authorization` header is always resolved first. Valid Bearer
  clients therefore retain the legacy/native contract even if a browser also
  has cookies. Cookie access is considered only when no Authorization header is
  present.
- `/auth/me` accepts an access cookie only while cookie transport is enabled.
- `/auth/refresh` and `/auth/logout` prefer the refresh cookie. If both cookie
  and body values are present, equal values are accepted and mismatched values
  are rejected as a transport conflict.
- An access Bearer header does not bypass CSRF on `/auth/refresh` or
  `/auth/logout`, because those endpoints revoke/rotate the refresh cookie
  rather than authenticate with the access token.
- Logout clears auth cookies even when session revocation fails; the original
  revocation error remains the response error.
- Raw token fields remain in auth response bodies during Phase 1 so existing
  clients are not broken. Removing them requires a versioned web contract and
  a completed client migration.

## CSRF and rollout

Signed CSRF token generation, exact Origin/Referer checks, and a global
cookie-authenticated guard are present. When `AUTH_COOKIE_TRANSPORT=on`, every
unsafe request carrying an auth cookie must include the matching readable CSRF
cookie/header pair and an exact allowed Origin/Referer. When the flag is `off`,
cookie-authenticated requests are blocked, while Bearer requests continue to
work. `AUTH_ORIGIN_ENFORCEMENT=on` additionally protects cookie transport on
auth bootstrap endpoints during controlled rollout.

The existing browser client remains Bearer/localStorage-compatible and sends a
CSRF header for cookie refresh/logout when a CSRF cookie is available. This
keeps Phase 1 dual support explicit without allowing a CSRF-less cookie session.

No Prisma schema or database migration is required for this phase. Existing
DB-backed refresh-session rotation and replay protection remain unchanged.
