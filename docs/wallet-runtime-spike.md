# Wallet runtime

Status: **superseded money-action contract**, September 12, 2026. Filename kept for existing links.

The previous prepare → claim → submit → receipt state machine is superseded by [Home is thin](home-is-thin.md).

Home now uses one owner-scoped `actions` row for a user-initiated review. The server authors calldata, stores unconfirmed calls in `pending`, and clears them when the owner confirms. The browser dispatches directly through CDP embedded wallet or Base Account with the action id as the provider idempotency key / EIP-5792 id. Provider handles and resolved transaction hashes are posted back while the tab lives; status is derived from time and Base receipts.

The runtime requires `DATABASE_URL`. Apply `apps/web/server/db/migrations/001_actions.sql` and `002_user_settings.sql` to a disposable database. Funding tables and integrations are unchanged.

Hosted swaps remain unavailable. This reset does not change trade availability.
