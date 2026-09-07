# Home web

Next.js App Router, strict TypeScript, and Tailwind CSS. Run commands from the repository root:

```sh
bun install --frozen-lockfile
bun dev
bun test
bun check
```

## Current status

The first credential-free UI/client slice is implemented:

- Mobile-first welcome and responsive desktop shell.
- Presentation-only country selection for the United States, Brazil, Indonesia, and a neutral global fallback.
- Anonymous explicit country choices remembered in browser storage after hydration.
- Separate, English-only language display; selecting a country does not imply translation or eligibility.
- Home, Save, and Invest navigation with truthful unconnected, empty, and unavailable states.
- Typed region configuration plus pure resolver tests for supported, unknown, missing, and override cases.

No wallet provider, email authentication, live balance, transaction signing, database, geo-header adapter, or financial route is connected. USDC, BRZ, and IDRX appear only as disabled secondary asset candidates; they are not enabled holdings or funding routes. The public CDP project ID can be configured for the later client-provider slice, but this UI preview does not consume it and remains credential-free.

- `app/`: routes, client presentation experience, root layout, and visual tokens.
- `config/regions.ts`: typed country/currency presentation registry and pure resolver.
- `config/country-preference.ts`: versioned anonymous browser preference helpers.
- `config/navigation.ts`: bounded primary navigation configuration.
- `.env.local`: local values, ignored by Git.

The future CDP client provider should wrap the interactive app boundary in `app/layout.tsx` (or a narrow provider component imported there). Authenticated session and real account data should then enter `HomeExperience` as explicit state/props, replacing the preview account panel without changing the country resolver into an eligibility check.

See the [root README](../../README.md), [product scope](../../docs/product-scope.md), and [implementation plan](../../docs/implementation-plan.md) for the broader build sequence. This slice is not full chunk 1: server geo, authenticated preference persistence, database readiness, and deployment checks remain for later work.
