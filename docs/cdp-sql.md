# CDP SQL chain-history adapter

Status: adapter and mocked tests implemented; live authentication and queries not run.
Last reviewed: 2026-09-07.

Home uses CDP SQL only as a read-only indexed history source. It is **not** a spendable-balance, transaction-confirmation, vault-position, debt, or authorization source. Current state and financial decisions must continue to use Base RPC/CDP balance APIs, receipts, and the relevant protocol adapter.

## Implemented contract

`apps/web/server/chain-data` provides:

- A fixed Base mainnet ERC-20 `Transfer(address,address,uint256)` history template over `base.events`.
- Runtime validation for a session-verified wallet address, operator-supplied asset allowlist, selected asset IDs, a maximum 31-day time window, page sizes of 1–200, and cache ages of 500–900,000 ms.
- Deterministic descending keyset pagination by block number, transaction hash, log index, and CDP log ID.
- Re-org-aware event selection using `GROUP BY log_id HAVING sum(toInt8(action)) > 0`. The adapter does not filter naively to added rows.
- Explicit string casts for block numbers, log indexes, and token amounts before JSON serialization. Runtime parsing rejects numeric values for these fields, preventing already-rounded JavaScript numbers from being accepted.
- Strict response validation: returned assets and participants must still match the requested allowlist and verified wallet.
- Separate `cached` and `stale` source flags plus CDP's execution timestamp, execution duration, and the local fetch timestamp.
- A fixed-host HTTP transport with a finite local timeout, typed 401/402/408/429/504 failures, no automatic retries, and no upstream body or credential text in errors.

The intended parent integration is:

1. Validate the browser session on the server.
2. Resolve the session's smart-account address from trusted provider data.
3. Pass that address as `verifiedWalletAddress`; never accept an unverified browser wallet as authority.
4. Resolve requested asset IDs against Home's reviewed Base asset registry and pass the matching `BaseErc20Asset[]` allowlist.
5. Return the normalized page to the authenticated caller with private/no-shared-cache response policy.

No API route, authentication handler, database record, UI, balance read, or mutation is included in this lane.

## Authentication decision

CDP's SQL quickstart currently tells programmatic users to create a **CDP Client API key** and use it as the bearer value for `/run`. The v2 REST OpenAPI reference describes the same endpoint's bearer security scheme as a **JWT signed with a CDP API Key Secret**. Those are distinct credential paths in the current official documentation.

The transport therefore supports two explicit modes and never guesses:

- `client-api-key`: loaded only from `CDP_SQL_CLIENT_API_KEY` by `createCdpSqlAuthFromEnv`.
- `signed-jwt`: the composition root injects `generateBearerToken` for the exact `POST api.cdp.coinbase.com/platform/v2/data/query/run` target. This lane does not load a general CDP key, does not implement key parsing, and does not assume a wallet/server-wallet secret is authorized for SQL.

No fallback reads `CDP_API_KEY_ID`, a general CDP secret, a client-side variable, another project, or an end-user wallet key. There are no new dependency additions. If the operator's project requires signed JWT mode, the parent can wire the official CDP server JWT generator after separately confirming that SQL entitlement; do not copy an existing wallet key into the SQL configuration merely because its format is accepted by a signing library.

## Safe operator commands

Configuration-only check (never sends a request):

```sh
CDP_SQL_CLIENT_API_KEY='set-in-your-shell' bun scripts/cdp-sql-check.ts
```

It prints only whether configuration is present, the selected auth mode, and `networkRequestMade: false`.

Opt-in smoke probe:

```sh
CDP_SQL_SMOKE=1 \
CDP_SQL_CLIENT_API_KEY='set-in-your-shell' \
CDP_SQL_SMOKE_WALLET_ADDRESS='verified Base smart account' \
CDP_SQL_SMOKE_ASSET_ID='operator registry ID' \
CDP_SQL_SMOKE_ASSET_ADDRESS='matching reviewed Base token address' \
bun scripts/cdp-sql-smoke.ts
```

The smoke command refuses network access unless `CDP_SQL_SMOKE=1`. It sends one read-only query covering only the previous hour, one explicitly supplied allowlisted asset, one verified wallet, and at most two provider rows (`limit: 1` plus one row to determine `hasMore`). It requests the maximum documented cache age to avoid needless repeat execution. It prints only safe metadata: success/failure category, HTTP status when relevant, cache/stale state, execution timestamp/duration, returned-row count, and whether another page exists. It never prints the key, bearer value, SQL text, wallet, asset address, cursor, or customer rows.

Do not run the smoke command in CI or during ordinary local tests. The parent/operator should make at most one tiny authorized probe after confirming project entitlement.

## Schema and correctness notes

The template uses the currently documented `base.events` columns: `log_id`, block fields, transaction hash, log index, event signature, contract `address`, decoded `parameters`, and `action`. CDP documents `parameters` as a variant map and describes an event as active when actions for a log ID sum above zero. Values from `parameters['value']` are cast to strings in SQL.

The query covers decoded ERC-20 transfer events only. It does not cover:

- native ETH transfers;
- logs that remain only in `base.encoded_logs`;
- protocol-specific vault, trade, borrow, or B20 semantics;
- Home operations that have not reached indexed chain data;
- ERC-4337 user-operation records.

For smart accounts, transfer participation can show token effects because the smart-account address appears in decoded event parameters. It does **not** make smart-account history complete. Bundled ERC-4337 activity must separately query `base.decoded_user_operations` by its documented `sender` field and correlate user-operation hashes, transaction hashes, and effects. Filtering only `base.transactions.from_address` would identify the bundler/EOA and can miss the user's smart account.

Re-org handling is limited to CDP's documented net-action semantics. Active logs are deduplicated by stable `log_id`; removed logs are omitted. The response still represents indexed history at `executionTimestamp`, not canonical confirmation authority. Recent actions must remain refreshable, and money-action status must be established from receipts/canonical chain evidence. If CDP changes action or log-ID semantics, fail validation/review the query rather than switching to added-only history.

## Error and caching behavior

- Local requests time out before CDP's documented 30-second server limit (10 seconds by default, configurable only up to 29 seconds).
- A 429 returns `rate-limited` and an optional parsed `retryAfterMs`; the transport does not poll or retry.
- A 408/504 or local abort returns `timed-out`.
- A 401/403 returns `unauthorized`; a 402 returns `payment-required`.
- Other non-success responses return a redacted `upstream-error`.
- The adapter itself has no persistence/cache fallback. A parent service may return previously stored history on transport failure only if it preserves the old execution timestamp and explicitly marks it stale. It must not present stale history as current balance or confirmation evidence.

## Verification status

Implemented and mocked:

- scoped SQL construction and injection rejection;
- allowlist, address, page, time, cursor, and cache bounds;
- lossless uint256/index parsing;
- keyset cursor creation;
- invalid/out-of-scope row rejection;
- response metadata validation and stale/cached distinction;
- fixed endpoint/auth request construction;
- signed-JWT callback request binding;
- timeout and single-attempt 429 behavior;
- credential/upstream-body redaction.

Pending live verification:

- whether the Home CDP project is entitled to SQL;
- which documented auth mode that project accepts;
- whether the exact CoinbaSeQL template compiles against the live service;
- decoded coverage for the operator's selected tokens and demo smart account;
- comparison of returned hashes and exact amounts with Base receipts;
- separate ERC-4337 sender history;
- observed re-org records and pagination across live indexed data.

No live SQL request, paid action, wallet mutation, or credential access was performed while implementing this adapter.

## Primary sources

- SQL quickstart and Client API key path: https://docs.cdp.coinbase.com/data/sql-api/quickstart
- Current SQL schema: https://docs.cdp.coinbase.com/data/sql-api/schema
- Run-query REST/OpenAPI reference, response envelope, signed-JWT scheme, timeout, row and cache limits: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/sql-api/run-sql-query
- CDP server JWT generator source inspected locally: `@coinbase/cdp-sdk` 1.55.0 read-only source cache at `/tmp/home-cdp-sdk.Xc0axH` (not added as a dependency).
