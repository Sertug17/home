# home

An open-source home for your money on Base.

Home is a mobile-first financial app designed around local currencies: sign in by email, hold and move money, add funds through local payment methods, save, and invest.

**Status: credential-free UI/client preview.** Next.js, TypeScript and Tailwind run locally in `apps/web`. The welcome now supports presentation-only country choices for the United States, Brazil, Indonesia and a neutral global fallback; anonymous explicit choices persist in the browser. Home, Save and Invest show truthful unconnected, empty and unavailable states. Authentication, server geo, account preference persistence, database access, wallet data and live financial integrations are not implemented. This is the first UI slice, not full chunk 1; the design documents describe the broader target.

## Run locally

Requires Node.js 22+ and Bun 1.3.12.

```sh
bun install --frozen-lockfile
bun dev
```

Open http://localhost:3000. The dev server binds to loopback only and supports hot reload. No credentials or database are needed for the UI preview. A public CDP project ID may be stored locally for the later provider slice, but the current app does not consume it.

```sh
bun test        # Focused region, persistence and navigation tests
bun lint        # ESLint
bun typecheck   # Next route types and strict TypeScript
bun build       # Production build
bun check       # Lint, typecheck and production build
bun start       # Serve a production build
```

Edit `apps/web/app/home-experience.tsx` for the interactive preview, `apps/web/app/globals.css` for visual tokens, `apps/web/config/regions.ts` for presentation regions, and `apps/web/config/brand.ts` for branding. Keep one root `bun.lock`; run dependency installs from the repository root. Future local secrets and local public configuration belong in `apps/web/.env.local`, never in source control. See `.env.example` for the current configuration shape.

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
