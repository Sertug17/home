# home

An open-source home for your money on Base.

Home is a mobile-first financial app designed around local currencies: sign in by email, hold and move money, add funds through local payment methods, save, and invest.

**Status: design only.** This repository contains the product scope, architecture and build plan. No application or live financial integrations have been implemented yet. Commands and package layouts in the design are proposed, not runnable.

## Start here

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

Fork this repository to follow along or build your own version. Brand, regions, asset selection and providers are designed to be replaceable. Each operator will configure their own provider projects, credentials and deployment. See the implementation plan for the next build slice; design feedback and focused pull requests are welcome.

Never commit credentials or funded-wallet secrets. Documented token/provider support is separate from a tested integration.

## License

Original repository content is licensed under [MIT](LICENSE). Linked third-party materials, provider SDKs and trademarks retain their respective terms.
