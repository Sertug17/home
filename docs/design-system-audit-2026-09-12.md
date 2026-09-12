# Design-system audit — September 12, 2026

Audit of `packages/ui`, `apps/design-system`, and adoption across every `apps/web` surface at `main` `b9ecca1`. One read-only auditor with design judgment produced the findings and contracts; the coordinator verified the census and wrote the sequencing. Companion: [Architecture audit](architecture-audit-2026-09-12.md). Direction: `AGENTS.md` (UI direction) and `home-is-thin.md` (client architecture).

## Summary

- **The foundation is sound and narrow** — `Text`/`Heading`, `Button`/`IconButton`, `haptic`, `Stack`/`Inline`/`Inset`/`Bleed`, `MoneyTicker`, 70 unique tokens, a Playwright-tested catalog. Nothing in the package is over-abstracted; the problem is adoption: 13 of 94 production TSX files import `@home/ui`.
- **Raw elements outnumber primitives 4:1** — 59 raw `<button>` vs 14 `Button`; 25 raw headings vs 8 `Heading`; 104 raw prose elements vs 38 `Text`; 10 raw inputs/selects, 4 raw `<dialog>`; 4,021 LOC of CSS modules plus a 1,391-LOC `globals.css` still carrying component rules.
- **The gaps are structural, not cosmetic.** Six primitives would absorb most of the surface: `Sheet` (the proven money-modal shell, also needed by sign-in and trade review), `ListRow` (finance rows, activity rows, discover rows), `Field`/`Input`/`Select` (address, amount, country), `SegmentedControl`, and the feedback set (`Skeleton`, `EmptyState`, `StatusMessage`, `Toast` — the toast that just landed in `client/home` belongs in the package).
- **One high-severity finding is shared with the architecture audit (DS-01 / F7 / A-22):** Save, Fund, Borrow, and Trade keep feature-local money formatting, so the same amount renders differently across surfaces. That lane (C3) runs first.
- **Tokens need a handful of semantic additions, not a token per literal**: focus halo, overlay, status triples, popover/sheet shadows, named layers, easing. Artwork (Home mark, globe, asset marks, chart series) stays literal by design.
- **Adoption must be enforced or it regresses**: ESLint bans on raw `<button>`/`h1–h4` outside the package behind a shrinking allowlist, a CSS literal audit with artwork exceptions, and a raw-vs-shared count printed in CI that fails only on regression.

## Census (production code, tests excluded)

| Measure | Current result | Scope note |
|---|---:|---|
| UI token declarations | 74 | Includes four reduced-motion redeclarations |
| Unique UI token names | 70 | `packages/ui/src/tokens.css` |
| Design-system app LOC | 310 | `apps/design-system/app/*.{tsx,css}` |
| Design-system app + runtime/config LOC | 347 | Adds `next.config.ts` and `playwright.config.ts`; explains the earlier 347 figure |
| Web CSS modules | 24 files / 4,021 LOC | Production module CSS under app/client/components |
| Web global stylesheet | 1,391 LOC | `apps/web/app/globals.css` |
| Production web TSX | 94 files | Tests excluded |
| Files importing `@home/ui` | 13 | Includes root and subpath imports |
| Raw/shared buttons | 59 / 14 `Button` / 1 `IconButton` | Regex tag count |
| Raw/shared headings | 25 / 8 `Heading` | Raw count covers `h1`–`h4` |
| Raw/shared prose | 104 / 38 `Text` | Raw count covers `p`, `small`, and `strong` |
| Raw inputs/selects | 10 | Native tags only |
| Raw dialogs | 4 | Native tags only |
| Files containing raw buttons | 25 | Production TSX |

## Findings

Severity: **high** = violates a home-is-thin invariant or hides a money bug; **medium** = structural gap that keeps adoption from happening; **low** = polish. Effort: S <1 day, M 1–2 days, L >2.

| ID | Area | Severity | Effort | Opened `file:line` evidence | Recommendation |
|---|---|---|---|---|---|
| DS-01 | Money presentation | **High** | M | `docs/home-is-thin.md:13`, `docs/home-is-thin.md:90`, `apps/web/client/savings/format.ts:6-15`, `apps/web/client/borrowing/borrowing-experience.tsx:327-350`, `apps/web/client/trading/trade-actions.tsx:332-334` | Consolidate atomic-to-display conversion in the shared formatting module and render changing money through `MoneyTicker`. Keep values as `bigint` from the boundary inward; never normalize with `Number`. Parsing, rounding, locale, and unavailable-value policy require shared tests. |
| DS-02 | Dialog and sheet infrastructure | Medium | L | `apps/web/client/money-modal/money-modal.tsx:17-58`, `apps/web/client/money-modal/money-modal.tsx:230-420`, `apps/web/client/money-modal/money-modal.tsx:554-574`, `apps/web/client/account/account-screen.tsx:144-170`, `apps/web/client/trading/trade-actions.tsx:321-363` | Promote the proven modal shell into `Sheet`: native dialog lifecycle, focus restoration, backdrop, Escape/cancel handling, safe-area anchoring, footer slots, reduced motion, and optional drag dismissal. Keep money steps, authentication sequencing, action preparation, routing, and provider state outside. |
| DS-03 | Repeated financial rows | Medium | M | `apps/web/components/finance-rows.tsx:4-17`, `apps/web/components/finance-rows.tsx:35-80`, `apps/web/components/finance-rows.module.css:1-29`, `apps/web/client/invest/discover-asset-row.tsx:30-49`, `apps/web/app/globals.css:1018-1091` | Promote the structural portion of `FinanceRow` to `ListRow`, supporting leading content, primary/secondary labels, trailing value/context, tone, and optional activation. Domain-specific asset resolution, money formatting, transaction semantics, and artwork remain consumer-owned. |
| DS-04 | Forms and fields | Medium | M | `apps/web/components/address-field.tsx:38-61`, `apps/web/components/country-select.tsx:25-45`, `apps/web/components/country-select.tsx:47-72`, `apps/web/client/funding/order-flow.tsx:126-167` | Add `Field`, `Input`, and `Select` primitives with label, hint, error, required state, described-by wiring, prefix/suffix, and an action slot. The action slot is necessary for address paste. Do not absorb address validation, decimal parsing, KYC rules, region options, or provider semantics. |
| DS-05 | Buttons and segmented controls | Medium | M | `packages/ui/src/button.tsx:4-12`, `packages/ui/src/button.tsx:14-46`, `packages/ui/src/icon-button.tsx:4-35`, `apps/web/client/trading/trade-actions.module.css:9-45`, `apps/web/client/savings/savings-experience.tsx:258-269` | Migrate ordinary actions to `Button`/`IconButton`; add only demonstrated size, stretch, and compact-icon options. Add a separate `SegmentedControl`/`Tabs` primitive for mutually exclusive choices and keyboard semantics instead of styling raw button groups. Routing and domain state remain callbacks supplied by consumers. |
| DS-06 | Typography adoption | Medium | M | `packages/ui/src/text.tsx:3-24`, `packages/ui/src/text.tsx:43-61`, `apps/web/client/savings/savings-experience.tsx:268-310`, `apps/web/client/trading/trade-actions.tsx:326-341`, `apps/web/app/globals.css:1009-1016` | Replace raw headings and prose with `Heading` and `Text` while preserving the existing semantic level. Map recurring visual roles to the established type scale rather than adding tokens for every `0.62rem`–`0.92rem` literal. Keep logo, chart, globe, and other artwork typography local. |
| DS-07 | Loading, empty, status, and toast feedback | Medium | M | `apps/web/app/globals.css:595-687`, `apps/web/app/globals.css:1120-1175`, `apps/web/client/savings/savings-experience.tsx:278-302`, `apps/web/client/home/action-toasts.tsx:40-78`, `apps/web/client/home/action-toasts.module.css:1-35` | Add `Skeleton`, `EmptyState`, `StatusMessage`, and `Toast` shell primitives. They should own visuals, live-region semantics, stacking, dismissal, and reduced-motion behavior. Data-loading inference, action polling, retry logic, and product wording stay outside. |
| DS-08 | Color and elevation token drift | Medium | M | `packages/ui/src/tokens.css:3-27`, `apps/web/client/trading/trade-actions.module.css:5-28`, `apps/web/client/funding/add-money.module.css:12-35`, `apps/web/client/account/account.module.css:9-22`, `apps/web/client/home/action-toasts.module.css:20-23` | Add semantic tokens for focus halo, overlay/backdrop, elevated shadows, semantic layers, and complete status text/background/border sets. Replace literals that mechanically equal existing text, action, surface, border, or error tokens. Do not tokenize intentional artwork palettes. |
| DS-09 | Radius and spacing consistency | Low | M | `packages/ui/src/tokens.css:61-79`, `packages/ui/src/styles.css:121-148`, `apps/web/client/trading/trade-actions.module.css:9-21`, `apps/web/client/funding/add-money.module.css:18-25`, `apps/web/app/globals.css:649-687` | Apply the 6px control radius to interactive controls and 12px to ordinary surfaces. Preserve `50%` for circles and `999px` only for genuine pills. Normalize incidental 6/10/14/18/22px spacing to the existing scale; add a semantic spacing token only when a shared primitive demonstrates a stable missing role. |
| DS-10 | Stylesheet concentration and legacy global rules | Medium | L | `apps/web/app/globals.css:595-710`, `apps/web/app/globals.css:994-1175`, `apps/web/app/globals.css:1192-1363`, `apps/web/client/invest/invest-experience.module.css:1`, `apps/web/client/money-modal/money-modal.module.css:1` | Delete global component rules as their primitives land. Keep globals limited to reset, app frame, font setup, compatibility helpers, and true cross-application utilities. Do not perform a wholesale CSS rewrite; remove each legacy region with its adopting component. |
| DS-11 | Design-system catalog coverage | Medium | M | `apps/design-system/app/foundation-catalog.tsx:4-11`, `apps/design-system/app/foundation-catalog.tsx:65-175`, `apps/design-system/tests/browser/foundation.pw.ts:65-89`, `apps/design-system/tests/browser/foundation.pw.ts:93-120` | Add one focused catalog section and state matrix per new primitive. Extend browser coverage for 320/390/1280px, 100/200% text, keyboard use, focus restoration, reduced motion, forced colors where applicable, and overflow. Avoid turning the catalog into a second product application. |
| DS-12 | Regression guardrails | Medium | M | `apps/web/eslint.config.mjs:41-83`, `apps/web/eslint.config.mjs:122-150`, `packages/ui/package.json:25-28`, `apps/web/package.json:12` | Add ESLint restrictions for raw `<button>` and `h1`–`h4` outside the shared package, initially using an explicit shrinking allowlist. Add a CSS audit for unapproved colors and control radii with artwork exceptions. Print raw/shared element counts in CI and fail only on regression until migration completes. |

## Primitive contracts

| Primitive | Minimum public contract | Package owns | Explicit non-goals |
|---|---|---|---|
| `Sheet` | `open`, `title`/`aria-labelledby`, `onDismiss`, `children`, optional `header`, `footer`, `initialFocusRef`, `dismissible`, `dragDismiss` | Dialog lifecycle, focus restoration, Escape/backdrop behavior, safe area, layout, motion, gesture ownership | Money-flow steps, authentication state, provider calls, route state, review copy |
| `ListRow` | `leading`, `label`, optional `description`, `value`, `valueDescription`, `tone`, and exactly one of `onPress`/`href` when interactive | Grid, truncation/wrapping policy, target size, separators, focus/press state | Asset lookup, icon selection, price calculation, transaction direction, destination routing |
| `Field` | `label`, `htmlFor`, optional `hint`, `error`, `required`, `action`, `children` | Label/help/error association and layout | Validation and parsing rules |
| `Input` / `Select` | Native props plus optional `prefix`, `suffix`; ref forwarding | Focus, disabled, invalid, sizing, type style | Address formatting, region lists, KYC eligibility, amount precision |
| `SegmentedControl` | `items`, `value`, `onValueChange`, `aria-label`, optional `stretch` | Selected state visuals, arrow/Home/End keyboard behavior, equal-width layout | URL changes, asynchronous state, trade/save semantics |
| `Badge` | `tone`, optional icon, children | Compact status treatment and contrast | Status derivation or market classification |
| `Divider` | orientation, decorative/labelled mode | Hairline and spacing | Section semantics beyond supplied markup |
| `Skeleton` | `shape`, `width`, `height`; optional grouped row count | Shimmer/static fallback and reduced-motion handling | Deciding whether data is loading or stale |
| `EmptyState` | `title`, optional description/action/icon | Minimal empty layout and typography | Product eligibility or recovery decisions |
| `Toast` | `tone`, `role`, `onDismiss`, optional duration and action | Viewport, live region, layering, dismissal, reduced motion | Polling actions, deduplication keys, money formatting, product message generation |

## Token strategy

### Keep the present foundations

The 70 unique tokens already cover:

- Core semantic colors and interaction states
- Surface descendant aliases
- UI and numeric font families
- Eleven visual type roles
- A constrained 4px-based spacing scale
- Control and surface radii
- Icon and accessible-target sizes
- Press, release, chip, and tab durations
- Reduced-motion overrides

`tokens.css` and `styles.css` should remain separate. Tokens are opt-in semantic values without element rules; styles contain shared component rules. Tailwind should also remain a separate integration entrypoint because both applications consume it independently through `@home/ui/tailwind.css`.

### Add only demonstrated semantic gaps

Recommended additions:

- `--home-ui-color-focus-halo`
- `--home-ui-color-overlay`
- Status text/background/border triples for success, warning, and error
- `--home-ui-shadow-popover`
- `--home-ui-shadow-sheet`
- Semantic layers such as sheet, popover, and toast
- Standard, enter, and exit easing tokens
- A sheet radius only if 16px remains an intentional mobile-surface decision after visual review

Do **not** add:

- A token for every literal spacing value
- Every observed fractional `rem` font size or unusual weight
- Money direction semantics such as “outgoing equals red”; outgoing money is not inherently an error
- Gesture spring stiffness/damping constants as CSS globals—those belong inside the `Sheet` implementation
- Globe, Home mark, asset artwork, chart-series, or brand-provider colors
- Arbitrary z-index values without a named layering contract

## Estimated CSS reduction in the largest modules

These are code-reading estimates, not measured transformations.

| Module | Current LOC | Approximate collapsible share | Likely shared replacements | What remains local |
|---|---:|---:|---|---|
| Invest | 532 | 45–55% | `ListRow`, segmented controls, `EmptyState`, `Badge`, tokens | Chart, asset artwork, discovery/detail layout |
| Money modal | 486 | 55–65% | `Sheet`, shared header/footer, fields, summary rows | Sheet implementation’s gesture mechanics and money-flow composition |
| Add money | 394 | 60–70% | Fields, method/list rows, buttons, badges, status messages, tokens | Provider flow decisions and method-specific content |
| Save | 333 | 50–60% | Hero amount role, `ListRow`, `Skeleton`, controls, status | Vault/domain layout and savings actions |
| Account | 254 | 40–50% | `Sheet`, fields, buttons, typography, divider | Authentication sequencing and provider state |
| Trade actions | 248 | 60–70% | Segmented control, fields, `Sheet`, review rows, status | Quote/permit preparation and trade state |

## Adoption lanes

Each lane is independently mergeable once its listed dependency has landed. Foundation lanes intentionally run serially because they touch shared exports and component styles. Adoption lanes can run in parallel with one writer per file set.

| Lane | Dependencies | Exclusive file ownership | Acceptance checks |
|---|---|---|---|
| L0 — Tokens and guardrails | None | `packages/ui/src/tokens.css`, token-only portions of `styles.css`; `apps/web/eslint.config.mjs`; new CSS/raw-element audit script; CI wiring; token catalog specimen | Existing UI lint/typecheck/tests; design-system browser suite; audit prints baseline counts and rejects new violations without requiring immediate zero |
| L1 — Sheet extraction | L0 | New `packages/ui/src/sheet*`; package exports; sheet catalog/tests; `client/money-modal/money-modal.tsx` and its shell CSS; account sign-in dialog shell; trade review dialog shell | Escape/backdrop rules, focus restoration, disabled dismissal, 320px/200% text, reduced motion; existing MoneyModal anchor/motion smoke remains green |
| L2 — Field/Input/Select | L1 | New field/input/select package files and specimens; `components/address-field*`; `components/country-select.tsx`; funding `order-flow*`; borrowing form-specific files | Native prop/ref forwarding, label/help/error wiring, paste suffix action, keyboard select behavior; no validation or parsing moves into UI package |
| L3 — ListRow/Badge/Divider | L0 | New row/badge/divider package files and specimens; `components/finance-rows*`; `client/invest/discover-asset-row.tsx` and only its row selectors | Interactive and static rows, 44px target, long labels, values at 200% text, selected/status tones; balance/activity semantic tests unchanged |
| L4 — Feedback primitives | L0 | New skeleton/empty/status/toast package files; `client/home/action-toasts*`; global shimmer and empty-state CSS regions; Save loading markup only | Live-region behavior, dismissal timers, reduced-motion skeleton, no horizontal overflow; action polling and message generation remain in web |
| L5 — Home, Balances, Navigation adoption | L3, L4 | `client/home/**` excluding action toast files; shell chrome/navigation files; corresponding CSS regions | Zero unallowlisted raw buttons/headings in owned files; Balances/Send isolation and back-navigation smoke pass |
| L6 — Money flow and Activity adoption | L1, L3, L4 | Money-modal child steps excluding the extracted shell; activity presentation files and their styles | `MoneyTicker` used for changing amounts; one-dispatch behavior, resumed Send review, Activity rendering, and sheet motion smoke pass |
| L7 — Save and Fund adoption | L2, L3, L4 | Savings files excluding L4 loading markup; funding `add-money*` excluding L2 order-flow files | Shared formatter and ticker use; raw-control count reduced; savings and funding targeted tests plus browser smoke |
| L8 — Invest and Trade adoption | L1, L2, L3 | Invest files excluding L3 discover row; trade files excluding L1 dialog shell | Rows and controls use primitives; permit/actionable review facts remain visible; no domain state enters `packages/ui` |
| L9 — Borrow, Account settings, Landing | L1, L2 | Borrow presentation files excluding L2 forms; account settings excluding L1 dialog shell; landing presentation/CSS | `bigint` money rendering preserved; auth sequencing unchanged; account reachability at 390px, 320px, and 200% text remains green |

### Parallelization

- **Serial foundation spine:** L0 → L1, with L2/L3/L4 rebased after L0 and coordinated around package exports.
- **Parallel primitive work after L0:** L2, L3, and L4 can proceed concurrently if each receives preassigned export/style regions or is merged one at a time.
- **Parallel adoption wave:** L5, L6, L7, L8, and L9 own disjoint product files and can run concurrently after their primitive dependencies land.
- Integrate and run the full web browser smoke after each adoption lane rather than postponing integration until the entire migration completes.

### How this interleaves with the architecture lanes

- **DS L0 (tokens + guardrails)** starts in architecture wave 1; it touches only `packages/ui`, lint config, and CI.
- **C3 (one formatting module)** covers DS-01 and lands before any adoption lane so migrated surfaces render money through `shared/formatting` + `MoneyTicker` from day one.
- **DS L1 (Sheet)** should land before **C4 (mounted panels + flow URLs)** finishes, so Add money / Save dialogs adopt the `Sheet` and the `?flow=` scheme together.
- **DS L4 (feedback primitives)** absorbs `client/home/action-toasts.tsx`; the toast behavior tests move with it.
- Adoption lanes L5–L9 own disjoint product files and can run four at a time after their primitive dependency lands; each is gated by the browser smoke on the integrated tree.

## Looked at and found clean (do not re-audit)

- `Button` defaults to `type="button"`, blocks activation while loading, preserves its label geometry, exposes `aria-busy`, forwards native props, and supports opt-in haptics: `packages/ui/src/button.tsx:14-46`.
- `IconButton` requires a concrete, non-empty accessible action label and hides its artwork from assistive technology: `packages/ui/src/icon-button.tsx:4-35`.
- `Text` and `Heading` correctly separate visual role from HTML semantics: `packages/ui/src/text.tsx:16-24`, `packages/ui/src/text.tsx:43-61`.
- Layout primitives remain deliberately narrow and token-constrained while permitting explicit exceptional spacing: `packages/ui/src/layout.tsx:3-23`.
- `MoneyTicker` accepts an already formatted string, does not parse it as a number, preserves anchored symbols/separators, respects reduced motion, and exposes the exact value accessibly: `packages/ui/src/money-ticker.tsx:31-44`, `packages/ui/src/money-ticker.tsx:63-99`.
- Tailwind is actively consumed by both applications; it is not dead integration code: `apps/web/app/globals.css:1-5`, `apps/design-system/app/globals.css:1-6`.
- Separate token, component-style, and Tailwind exports are an appropriate package boundary: `packages/ui/package.json:15-17`.
- Home mark and supported-globe literals are intentional artwork rather than semantic UI-token failures.
- The design-system Playwright suite already checks narrow widths, enlarged text, target sizes, font fallback, ticker accessibility, and overflow: `apps/design-system/tests/browser/foundation.pw.ts:65-120`.
- Existing web smoke coverage protects recognized-token isolation, single-dispatch behavior, resumable Send review, Balances navigation restoration, account reachability, and MoneyModal motion: `apps/web/tests/browser/smoke.pw.ts:218-289`, `apps/web/tests/browser/smoke.pw.ts:596-688`, `apps/web/tests/browser/smoke.pw.ts:891-959`.

## Method and limits

Read-only inspection with census commands over production TSX/CSS; CSS-collapse percentages are code-reading estimates. Builds and tests were not run for the audit. Behavior and visual equivalence are proven per adoption lane by the design-system browser suite and the web smoke, not by this document.

## Baseline — September 12, 2026

`bun run ds:audit` scans production TSX plus web CSS modules and `app/globals.css`. The committed regression ceilings are 59 raw buttons, 25 raw headings, 104 raw prose elements, 68 non-artwork color literals, and 22 non-artwork pixel radius declarations. The informational adoption counts are 15 shared buttons, 8 shared headings, 38 shared prose elements, and 13 files importing `@home/ui`.

The CSS artwork exceptions are file-specific: `client/invest/asset-icon.module.css`, `client/landing/supported-globe.module.css`, `components/currency-mark.module.css`, and `components/home-mark.module.css`. Asset-mark colors rendered in `currency-mark.tsx` and the chart series color in `price-chart.tsx` are outside the CSS scan. Guarded counts may fall below this baseline; CI fails only when one rises above it.
