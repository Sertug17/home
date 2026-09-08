# home

An open-source home for your money on Base.

Home is a mobile-first financial app designed around local currencies: sign in by email, hold and move money, add funds through local payment methods, save, and invest.

**Status: local, read-only build.** Home has persistent browser country preferences, shared CDP email-session validation, an account address view, informational Stocks/Memes browsing, public Morpho USDC vault reads, and a server-only CDP SQL transfer-history adapter. SQL authentication and two-page transfer queries have been verified with a public fixture. Home holdings/prices, Base Account sign-in, database persistence, server geo, and financial execution remain unimplemented. No send, trade, deposit, or withdrawal is enabled; the design documents describe the broader target.

## Run locally

Requires Node.js 22+ and Bun 1.3.12.

```sh
bun install --frozen-lockfile
bun dev
```

Open http://localhost:3000. The dev server binds to loopback only and supports hot reload. Browsing works without credentials; email sign-in consumes the public CDP project ID and requires matching server credentials for verification. Store configuration in `apps/web/.env.local` using the root `.env.example` as a template; do not overwrite an existing local environment file. No database is required for this read-only milestone.

```sh
bun test        # Deterministic unit and contract tests; live probes stay opt-in
bun lint        # ESLint
bun typecheck   # Next route types and strict TypeScript
bun build       # Production build
bun check       # Tests, lint, typecheck and production build
bun start       # Serve a production build
```

Edit `apps/web/app/home-experience.tsx` for the Home shell, `apps/web/features/` for account/Invest/Savings UI, `apps/web/app/globals.css` for visual tokens, and `apps/web/config/` for presentation settings and sourced asset identities. Keep one root `bun.lock`. Real configuration belongs only in the gitignored `apps/web/.env.local`; never commit secrets.

## Start here

- [CDP setup](docs/cdp-setup.md) — project/origins, email login, server validation and privacy defaults.
- [SQL setup](docs/cdp-sql.md) — explicit authentication mode, bounded smoke tests and history limitations.
- [Morpho setup](docs/morpho-setup.md) — USDC vault candidates and read-only verification.
- [Invest data](docs/invest-data.md) — stock/meme identities and price/eligibility boundaries.
- [Technical design](docs/technical-design.md) — architecture, provider boundaries, persistence, signing and status recovery.
- [Implementation plan](docs/implementation-plan.md) — buildable chunks, dependencies and acceptance checks.
- [Product scope](docs/product-scope.md) — user experience and roadmap.
- [Regional money](docs/regional-money.md) — geo defaults and native-currency presentation.
- [Currency defaults](docs/currency-defaults.md) — confirmed selections, including **CADD for Canada** and **wARS for Argentina**.
- [Stablecoin candidates](docs/stablecoin-candidates.json) — sourced Base contract metadata; verification remains pending and every asset is disabled.

## Planned stack

Next.js, TypeScript and Tailwind; CDP email sign-in and user-controlled smart accounts; Neon Postgres through Vercel Marketplace; CDP SQL history, RPC balances/receipts and CDP webhooks. Build locally first, then deploy to Vercel at the end of the initial build. No cron or standalone indexer initially.

Country defaults come from approximate geo detection with a manual override. The interface leads with native currency names and symbols; underlying token details remain available. Agent-assisted actions use the same review flow and require user signing.

Later features include Morpho borrowing, a Venice agent interface with x402/DIEM exploration, and a Rain debit card with Base settlement.

## Forking and contributing

Fork this repository to follow along or build your own version. Brand, regions, asset selection and providers are designed to be replaceable. Each operator will configure their own provider projects, credentials and deployment. See the implementation plan for the next build slice; design feedback and focused pull requests are welcome. Pull requests and pushes to `main` run GitHub Actions CI: `bun install --frozen-lockfile` then `bun check`. Live probes stay opt-in and are not enabled in CI.

Never commit credentials or funded-wallet secrets. Documented token/provider support is separate from a tested integration.

## License

Original repository content is licensed under [MIT](LICENSE). Linked third-party materials, provider SDKs and trademarks retain their respective terms.
