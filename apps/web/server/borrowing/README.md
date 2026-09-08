# Bounded Base Morpho borrow market

Verified on September 8, 2026 against Morpho's public market API and Base JSON-RPC.

## Supported market

- Chain: Base (`8453`)
- Morpho Blue core: `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb`
- Market ID: `0x9103c3b4e834476c9a62ea009ba2c884ee42e94e6e314a26f04d312434191836`
- Loan token: USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals)
- Collateral token: cbBTC `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` (8 decimals)
- Oracle: `0x663BECd10daE6C4A3Dcd89F1d76c1174199639B9`
- IRM: `0x46415998764C29aB2a25CbeA6254146D50D22687`
- LLTV: `860000000000000000` (86%)

Official sources:

- Morpho market endpoint: `https://api.morpho.org/v0/blue/markets/8453:0x9103c3b4e834476c9a62ea009ba2c884ee42e94e6e314a26f04d312434191836`
- Morpho contract addresses: `https://docs.morpho.org/get-started/resources/addresses/`
- Morpho Blue contract interfaces: `https://docs.morpho.org/get-started/resources/contracts/morpho/`
- Morpho math reference: `https://docs.morpho.org/get-started/resources/contracts/morpho/#mathlib`

The RPC reader also calls `idToMarketParams` at the pinned Base block and fails closed unless all five parameters match these constants. No other collateral, tokenized-stock market, chain, or Morpho deployment is accepted.

## Execution boundary

The server derives position debt from borrow shares with Morpho's virtual share/asset rounding, accrues indexed debt to the pinned block using the market IRM rate, and validates current oracle, collateral, liquidity, wallet balances, allowances, and action simulation. All `onBehalf` and receiver fields are the verified session wallet.

Every action is simulated as one ordered Coinbase smart-account `executeBatch((address,uint256,bytes)[])` call at the pinned block. The RPC verifies non-empty deployed account code, reads the proxy's deployed implementation, verifies non-empty implementation code, simulates from the account itself (a caller permitted by Coinbase Smart Wallet's owner-or-entry-point execution guard), and then reconfirms the pinned block hash. Counterfactual or incompatible account deployments remain explicitly unavailable rather than falling back to unrelated-call simulation.

Supply and exact partial repay approvals are capped to the reviewed amount and carry reviewed-token/spender metadata. Repay all uses Morpho's share-based form (`assets = 0`, current `borrowShares`, verified `onBehalf`, empty callback) with a finite user-reviewed USDC maximum no greater than the verified wallet balance. The current debit is a separate estimate. If debt accrues above that cap before execution, token transfer fails and the user must refresh and review a new maximum; Home never silently increases the cap or requests unlimited approval.

Coinbase sources for the batch ABI and execution guard:

- `https://github.com/coinbase/smart-wallet/blob/main/src/CoinbaseSmartWallet.sol`
- `https://github.com/coinbase/smart-wallet/blob/main/src/MultiOwnable.sol`
