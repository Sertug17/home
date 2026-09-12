# Money-action persistence

> **Superseded by `docs/home-is-thin.md` on September 12, 2026.** The former operation ledger, claims, attempt states, evidence indexes, runtime-store selection, and provider-handle journal were deleted by the thin-actions reset.

Home now persists one thin `actions` row for each user-confirmed action. The server verifies the owner, builds and temporarily stores the call plan at prepare, marks the row confirmed before dispatch, and accepts the provider handle or transaction hash afterward. The chain and provider remain the source of execution status; Home derives `pending` or `unknown` when no verified receipt is available.

The browser owns dispatch only while its tab lives. The owner-generation fence is checked before every provider call and server POST. Explicit wallet rejection is retryable in that tab with the same action ID; an ambiguous failure remains single-dispatch and is not replayed.

See `docs/home-is-thin.md` for the current schema, flow, retry semantics, owner fence, tests, and accepted failure modes.
