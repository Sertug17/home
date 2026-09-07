# CDP session validation setup

Status: local implementation completed September 7, 2026; real browser login and deployed-origin verification remain pending.

Home validates CDP end-user access tokens at `GET /api/session`. The browser sends its CDP access token in `Authorization: Bearer <access-token>`. The server validates that token with the CDP project API and returns only the verified CDP subject and the first verified EVM smart-account address.

## CDP project setup

1. Create or select the CDP project that owns the client-side end-user authentication configuration.
2. Add the app origin to that project's allowed origins. For local development on this lane, use `http://127.0.0.1:3103`. Add the exact production origin separately before deployment.
3. Create a **Secret API Key** in the same project. The API key's project scope is what constrains `validateAccessToken`: a token must validate against the project identified by the server key. Tokens rejected by that validation, including tokens from another project, are not accepted.
4. Set these server-only environment variables in the web runtime:

   ```sh
   CDP_API_KEY_ID=your-secret-api-key-id
   CDP_API_KEY_SECRET=your-secret-api-key-secret
   ```

Do not prefix these variables with `NEXT_PUBLIC_`. Do not configure `CDP_WALLET_SECRET` for session validation. This endpoint does not create server wallets, sign transactions, use private keys, or return provider authentication methods.

## Local verification

Install the pinned dependencies and start the web app on the lane's local port:

```sh
bun install --frozen-lockfile
bun run --cwd apps/web dev --port 3103
```

After completing a real CDP client login in the browser, call the same-origin route with the client access token:

```sh
curl -i \
  -H "Authorization: Bearer <access-token>" \
  http://127.0.0.1:3103/api/session
```

Expected successful shape:

```json
{
  "user": { "subject": "verified-cdp-user-id" },
  "smartAccount": {
    "address": "0x...",
    "chainId": 8453
  }
}
```

`smartAccount` is `null` when the verified CDP account list has no EVM smart account. Home never substitutes an owner EOA. `chainId: 8453` identifies the Base response presentation network; it does not assert that the account is deployed, funded, eligible, or able to transact.

Missing, malformed, invalid, expired, or cross-project tokens return `401 UNAUTHENTICATED`. Missing server credentials and provider initialization, transport, rate-limit, or service failures return `503 AUTH_UNAVAILABLE`. Every response is private and `no-store`; provider payloads and errors are not returned.

## Milestone boundary

This milestone establishes server-side token validation only. The returned `subject` is the verified CDP identity, not a persisted Home user ID. There is no database persistence or wallet-link record in this implementation. A successful local or deployed login has not yet been verified with real project credentials; perform that credentialed smoke test privately after the client login integration and origin configuration are available.
