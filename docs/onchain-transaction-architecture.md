# Onchain transaction architecture

> **Superseded by `docs/home-is-thin.md` on September 12, 2026.** The former attempt-aware ledger, atomic claim, admission release, evidence journal, reconciliation state machine, and staged migration design were deleted by the thin-actions reset.

## Current thin flow

1. The verified server session scopes the owner and the server prepares all calldata.
2. The browser captures the owner generation when prepare succeeds.
3. Confirm makes the thin action row visible and returns the final calls.
4. The browser rechecks the generation immediately before dispatching through CDP or Base Account.
5. The browser posts the provider handle and, when available, the transaction hash. The server verifies receipts and derives display status; the provider and chain remain the execution record.

## Dispatch retry boundary

- An explicit user rejection is definitely not submitted by that invocation. Home returns a typed `rejected` result, evicts only that rejected dispatch promise, and permits another user-initiated attempt with the same action ID.
- An ambiguous provider or transport failure may have submitted. Home retains the original dispatch promise and does not call the provider again. Base status lookup and CDP idempotent replay are recovery tools only where the current thin flow explicitly invokes them; they do not authorize a new execution identity.
- Owner-generation changes always stop work before the next provider call or server POST.

See `docs/home-is-thin.md` for the current schema, provider-specific behavior, failure modes, invariants, and test policy.
