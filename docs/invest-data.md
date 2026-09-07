# Invest data boundary

Verified: September 7, 2026

The Invest feature is a read-only presentation surface. It contains no swap, quote, wallet, authentication, persistence, or public API behavior. Prices are absent by default and can only appear when the caller passes a display value with a source label and timestamp.

## Tokenized stocks

The bounded launch roster follows the official Base stock page and its linked Base explorer contracts. These are Coinbase-issued Regulation S instruments and remain unavailable in the United States. A country preference is presentation only and cannot unlock them.

| Company | Symbol | Base contract |
| --- | --- | --- |
| NVIDIA | NVDAc | `0xb20000000000000000000078ee7ce2fE4908108C` |
| Meta | METAc | `0xb2000000000000000000008bC8786B856E61707C` |
| Apple | AAPLc | `0xb200000000000000000000C2e324d24d7eEcd1fb` |
| Alphabet | GOOGLc | `0xb2000000000000000000002D0BA3164cc74f58B7` |

Primary sources:

- Official Base stock roster: https://www.base.org/stocks
- Base announcement and restriction summary: https://blog.base.org/tokenized-stocks
- Canonical contract identity: the Base explorer link attached to each instrument on the official roster; those links are preserved in `apps/web/config/invest-assets.ts`.

No route, liquidity, wallet compatibility, user eligibility, or trade execution has been verified for Home.

## Base-native meme sample

This sample is intentionally small and informational. Inclusion is not an endorsement and does not imply liquidity, suitability, eligibility, or a Home trading route.

| Project | Symbol | Base contract | Primary project source | Contract source |
| --- | --- | --- | --- | --- |
| Degen | DEGEN | `0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed` | https://www.degen.tips/ | https://basescan.org/token/0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed |
| Toshi | TOSHI | `0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4` | https://www.toshithecat.com/ | https://basescan.org/token/0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4 |

BRETT was investigated but not added to this bounded roster because a primary project source tied clearly enough to the canonical contract was not established during this lane. It can be added later only with the same project-plus-contract evidence standard.

## Caller-supplied market snapshots

`InvestExperience` accepts separate stock and meme `MarketDataState` values. A ready snapshot carries:

- the configured asset ID;
- a preformatted display price;
- a source label and source timestamp;
- an optional source URL.

The component does not parse, calculate, convert, refresh, or authorize from these values. Missing, loading, empty, and failed data display an em dash and explicit unavailable copy, never zero.
