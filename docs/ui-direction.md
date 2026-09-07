# UI direction

Home uses a clean, product-first financial interface informed by the official Base brand guidance (reviewed September 7, 2026): `https://www.base.org/brand`, `https://www.base.org/brand/color`, and `https://www.base.org/brand/typography`.

- White and near-black lead; thin Base grays provide structure.
- Base blue is the single primary action accent. Country colors appear only as small location indicators.
- The interface uses no gradients, translucent layers, decorative brand assets, or copied Base fonts.
- Base Sans and Base Mono are not bundled because reuse rights for this project are unverified. Home currently uses a system sans-serif stack with no external font dependency.
- Layout, account state, activity, and navigation take priority over marketing illustration or unsupported financial claims.

## Feature-module contract

Savings and Invest modules are passed into `HomeExperience` through `savingsContent` and `investContent`. Their scoped styles can use the shared `--home-white`, `--home-ink`, `--home-blue`, and `--home-gray-50` through `--home-gray-800` tokens. Feature panels should stay flat and white with crisp gray separators, no gradients, glass, shadows, or restricted fonts.
