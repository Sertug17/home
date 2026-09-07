# CDP session validation setup

Status: local implementation completed September 7, 2026; real browser login and deployed-origin verification remain pending.

Home validates CDP end-user access tokens at `GET /api/session`. The browser sends its CDP access token in the `Authorization` header, and the server returns only the verified CDP subject and Base smart-account address. This endpoint validates identity only; it does not assert that the account is deployed, funded, eligible, or able to transact.

Missing, malformed, invalid, expired, or cross-project tokens return `401 UNAUTHENTICATED`. Missing server credentials and provider initialization, transport, rate-limit, or service failures return `503 AUTH_UNAVAILABLE`. Every response is private and `no-store`; provider payloads and errors are not returned. A provider `401` can also indicate mismatched or invalid developer credentials, so the required private live smoke must verify both browser sign-in and server validation with credentials from the same CDP project.

## Local setup

1. Create or select a CDP project and configure `http://localhost:3000` as an allowed local origin in its public project settings.
2. For a fresh clone, copy the root `.env.example` to `apps/web/.env.local` and set `NEXT_PUBLIC_CDP_PROJECT_ID` to the project's public ID. If that file already exists, add only missing variables; do not overwrite existing credentials.
3. Set the server-only `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` values from that same project. Never give either variable a `NEXT_PUBLIC_` prefix.
4. Run `bun dev`, then open `http://localhost:3000/account`.
5. Complete email sign-in in the browser. Keep the real one-time code and access token in the browser flow; do not paste either into a shell command or shell history.

The server SDK's usage tracking and error reporting are disabled by Home before the SDK loads when `DISABLE_CDP_USAGE_TRACKING` and `DISABLE_CDP_ERROR_REPORTING` are unset. Operators may explicitly set either variable to `false` to opt that channel back in after reviewing CDP's data policy. This default applies in production even when `.env.example` was not copied.

## Required live smoke

With private credentials configured, verify that browser email sign-in succeeds, `GET /api/session` returns the expected project identity, private account details remain hidden on validation failure, and sign-out completes. Repeat against each deployed origin after adding that origin to the public CDP project configuration. Do not record real OTPs, access tokens, or server credentials in commands, screenshots, logs, or documentation.

## Milestone boundary

This milestone establishes server-side token validation only. The returned `subject` is the verified CDP identity, not a persisted Home user ID. There is no database persistence or wallet-link record in this implementation. Deterministic selection among multiple accounts and broader rate-limiting policy remain deferred before production; do not infer either from a successful validation response.
