# Base wallet balances

Status: integrated into the verified Home dashboard as a read-only server/API, client hook, and presentation path. No private-wallet live read was performed during implementation.
Updated: 2026-09-07

## What this reads

Home reads two explicit assets for the smart account returned by the verified CDP session boundary:

- Native ETH on Base mainnet (chain ID `8453`), 18 decimals.
- Circle USDC on Base at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals.

Circle's primary USDC contract-address registry lists that Base mainnet contract: [Circle — USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses). Circle's native-USDC precision documentation specifies six decimal places: [Circle — USDC-backed stablecoin reference specification](https://developers.circle.com/xreserve/concepts/usdc-backed-stablecoin-specification). Base's primary RPC documentation lists mainnet chain ID 8453 and the public `https://mainnet.base.org` endpoint: [Base — RPC overview](https://docs.base.org/base-chain/api-reference/rpc-overview).

These identities were rechecked on 2026-09-07. Home does not include ticker-matched or locally issued stablecoins in this response. The response is token quantity only: it does not provide fiat valuation, net worth, price data, or a redemption/parity claim.

## Server configuration and behavior

`GET /api/portfolio` runs on the Node runtime and remains dynamic. It passes the original `Request` directly to the existing `createSessionHandler` in process, preserving request headers and query parameters for the shared Base Account authentication boundary. It does not call `/api/session` over loopback and does not accept a wallet address from the browser as authority.

A successful session response is parsed again at the feature boundary. Only the verified `smartAccount.address` on chain 8453 reaches the RPC reader. A session with no smart account returns `SMART_ACCOUNT_UNAVAILABLE`; it never falls back to an EOA. Session 401/503 responses are relayed directly. Portfolio failures return an unavailable error, never synthetic zero balances. Every private response uses:

```text
Cache-Control: private, no-store, max-age=0
Pragma: no-cache
Vary: Authorization, X-Home-Account-Provider
```

By default the reader uses Base's public mainnet endpoint:

```text
https://mainnet.base.org
```

Base documents its public endpoints as rate-limited and unsuitable for production traffic. The default is appropriate for local development and bounded checks; production operators should set the server-only `BASE_RPC_URL` to their managed Base endpoint. The value must use HTTPS. Plain HTTP is accepted only for a loopback hostname such as `http://127.0.0.1:8545`. User info, URL fragments, non-HTTP schemes, and non-loopback plaintext endpoints are rejected. Never expose this value with a `NEXT_PUBLIC_` prefix.

The RPC reader has one finite six-second deadline, no retries, no polling, no background work, and no shared private-response cache. It:

1. calls `eth_chainId` and rejects any chain other than 8453;
2. obtains one latest block number/hash/timestamp;
3. batches exactly one `eth_getBalance` and one USDC `balanceOf(address)` `eth_call`, both pinned to that block number;
4. checks the source block again and rejects a hash change during the read.

HTTP errors, RPC errors, missing batch entries, malformed JSON, malformed/canonical hex failures, a changed source block, and values outside uint256 all fail closed. Provider response bodies and configured endpoint credentials are not logged.

## API contract

A successful response has this shape:

```json
{
  "walletAddress": "0x...",
  "chainId": 8453,
  "blockNumber": "35123456",
  "blockHash": "0x...",
  "blockTimestamp": "1788811200",
  "fetchedAt": "2026-09-07T20:30:00.000Z",
  "assets": [
    {
      "id": "usdc",
      "symbol": "USDC",
      "decimals": 6,
      "kind": "erc20",
      "tokenAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "balanceBaseUnits": "1234500"
    },
    {
      "id": "eth",
      "symbol": "ETH",
      "decimals": 18,
      "kind": "native",
      "balanceBaseUnits": "42000000000000000"
    }
  ]
}
```

`blockNumber`, `blockTimestamp`, and `balanceBaseUnits` are canonical decimal integer strings. `blockTimestamp` is Unix seconds. Amounts are converted from RPC hex with `BigInt`; no monetary quantity passes through JavaScript floating point.

## Client composition contract

The portfolio feature exports:

```ts
type VerifiedPortfolioSession = {
  subject: string;
  smartAccountAddress: `0x${string}`;
  chainId: 8453;
};

type FetchPortfolio = (signal: AbortSignal) => Promise<unknown>;

usePortfolio(
  session: VerifiedPortfolioSession | null,
  fetchPortfolio: FetchPortfolio,
): PortfolioState;
```

`PortfolioHomeExperience` maps the production account owner's verified session to `VerifiedPortfolioSession` and passes the shared client's fixed-endpoint `fetchPortfolio(signal)` callback into the hook. That callback obtains the CDP access token internally and sends the same `accountProvider` selector used for session validation. The portfolio route passes the original request through `createSessionHandler`, then requires the successful response's `accountProvider` to match the request selector before reading balances. The hook itself does not import the wallet SDK, request an access token, or construct authenticated headers. It validates that the returned wallet and chain match the expected verified session and validates the exact USDC/native ETH response identities.

Home presents the formatted USDC token amount as the dominant **USD/USDC balance** and explicitly says ETH is shown separately. The USDC amount is not labeled as total net worth, is not relabeled to the selected country's currency, and does not include an invented ETH valuation. ETH remains a separate native token amount. Missing, malformed, or failed data stays unknown; a successful RPC zero remains visibly `0`.

States are `loading`, `ready`, `error`, and `unavailable`. Logout and account changes hide the previous snapshot immediately. Each request receives an abort signal, and sequence guards prevent late A-account or logged-out responses from becoming visible. A real successful zero is `ready`; malformed, failed, and unavailable responses retain unknown state and are never converted to zero.

`formatBaseUnitAmount(baseUnits, decimals)` performs exact decimal placement and strips only insignificant trailing fractional zeroes. It does not round. For example, one wei displays as `0.000000000000000001`, not zero.

## Verification boundary

All automated RPC tests use controlled transport fixtures; they exercise the production parser/reader without making network calls. Hook tests mount the production React hook with controlled HTTP callbacks and cover A-to-B switching, logout, aborts, late responses, mismatched wallets, and actual zero results. Production-owner/Home integration tests cover embedded and Base provider propagation, exact USDC/ETH display, country-label isolation, and clearing the prior wallet amount before a new owner resolves. No funded or private user wallet was queried during implementation. The first real Base Account balance read remains part of the security-reviewed manual compatibility smoke described in `docs/base-account.md`.
