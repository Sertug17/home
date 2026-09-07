# Codex market prices

Verified: September 7, 2026

Home Invest uses a server-only Codex GraphQL adapter for read-only USD market indications. These snapshots are not executable trade quotes, guarantees, underlying off-chain stock prices, or claims that one token equals one share or one native coin.

## Public contracts

- `GET /api/market-prices` is a public, signed-out-safe, same-origin read. It accepts no addresses, GraphQL, SQL, asset IDs, or other browser input.
- The server derives every Codex input from the authoritative `investAssets` export and its exact Base contract identity (`networkId: 8453`).
- The JSON envelope contains `version`, `provider`, a separate server `fetchedAt`, and category-keyed values using the existing `MarketDataState` contract.
- Each ready snapshot retains the exact configured `assetId`, a string-preserved USD display price, Codex source label/link, and Codex source `timestamp` converted to ISO UTC in `asOf`.
- `useMarketPrices()` loads that endpoint once, returns a stable `{ stockMarket, memeMarket, cryptoMarket? }` props object, and ages source snapshots out while mounted. It does not poll, open a WebSocket, or start background work.
- `PricedInvestExperience` passes that stable object to `InvestExperience`. App Integration only needs to render `PricedInvestExperience` where the unpriced component is currently composed. The optional `cryptoMarket` property automatically becomes meaningful when the Crypto Majors registry/UI change is merged.

Missing server configuration returns useful `unavailable` states without contacting Codex. Upstream failures return a generic 502 error state without provider bodies, headers, or credentials.

## Server setup

Create a Codex key at `dashboard.codex.io/api-keys`. The public Codex getting-started documentation currently describes a $1 account activation fee; Home must not automate signup, activation, billing, or key creation.

Put the real server-only value in `apps/web/.env.local`, keep that file permission `0600`, and use this single entry:

```dotenv
CODEX_API_KEY=<your Codex key>
```

Never use a `NEXT_PUBLIC_` prefix. The adapter sends the key raw in the `Authorization` header, without a Bearer prefix. The committed `.env.example` contains an empty placeholder only.

## Provider request and validation

Endpoint: `POST https://graph.codex.io/graphql`

The bounded query is:

```graphql
query GetTokenPrices($inputs: [GetTokenPricesInput!]!) {
  getTokenPrices(inputs: $inputs) {
    address
    networkId
    priceUsd
    timestamp
  }
}
```

Codex documents a 25-token maximum per `getTokenPrices` request. Home uses one batch for the current roster, splits only when the authoritative registry exceeds 25, and rejects a registry larger than four batches (100 assets). There are no retries. Each request has an eight-second timeout; successful per-process results are cached for 45 seconds and concurrent reads are coalesced.

The per-process cache is not a project-wide production rate limiter. Multiple instances can each call Codex, and every GraphQL query can count against provider quotas. Production rollout must monitor the Codex plan/request budget and add shared coordination only if actual deployment scale requires it; this change intentionally adds no Redis, framework, or SDK.

Codex's current reference describes `TokenPrice.priceUsd` as a GraphQL `Float`, so the JSON response carries a numeric token rather than an arbitrary-precision JSON string. Home parses the response text losslessly and preserves the exact numeric lexeme instead of first coercing it through JavaScript `number`. Positive decimal and exponent forms are accepted. Null, missing, malformed, non-finite, negative, or zero prices are unavailable, never fabricated as zero.

Records are accepted only when address plus network match an allowlisted configured asset. Out-of-scope, duplicate, malformed, stale, or more-than-60-seconds-future records are omitted. Source freshness is based only on Codex `timestamp`, with a five-minute budget; request/fetch time is retained separately and never substituted for trade freshness.

Official references reviewed:

- https://docs.codex.io/api-reference/queries/gettokenprices
- https://docs.codex.io/api-reference/objects/token-price
- https://docs.codex.io/get-started
- https://docs.codex.io/concepts/rate-limits

The public reference currently names the argument element type `GetPriceInput`, while Codex's authenticated example and the verified implementation contract supplied for Home use `GetTokenPricesInput`. The scoped live request was rejected before data/schema verification because the supplied account key was not activated, so this naming discrepancy remains a launch check.

## Scoped live verification

One bounded batch containing all 11 requested Base contracts was sent on September 7, 2026. The request received HTTP 403 with the provider classification “API key is not activated.” No retry or diagnostic request was made, and no credential or raw response was saved.

Because authorization stopped the request before price data, exact Codex coverage remains unverified for every public asset ID:

| Asset ID | Base representation | Live Codex result |
| --- | --- | --- |
| `nvdac` | NVDAc | Unverified — key not activated |
| `metac` | METAc | Unverified — key not activated |
| `aaplc` | AAPLc | Unverified — key not activated |
| `googlc` | GOOGLc | Unverified — key not activated |
| `degen` | DEGEN | Unverified — key not activated |
| `toshi` | TOSHI | Unverified — key not activated |
| `cbbtc` | cbBTC | Unverified — key not activated |
| `cbxrp` | cbXRP | Unverified — key not activated |
| `cbdoge` | cbDOGE | Unverified — key not activated |
| `cbltc` | cbLTC | Unverified — key not activated |
| `cbada` | cbADA | Unverified — key not activated |

After account activation, the parent should run exactly one fresh 11-contract batch and confirm: the accepted GraphQL input type name, response order/nullable behavior, raw `priceUsd` numeric shape, timestamp units, and coverage for each exact contract. Do not substitute an underlying equity, BTC/XRP/DOGE/LTC/ADA index, or native-network price for a missing Base token-contract price.

Before production display, also review the applicable Codex terms/API agreement for caching, attribution, redistribution, and commercial display rights. Public API access alone is not treated here as a license conclusion.
