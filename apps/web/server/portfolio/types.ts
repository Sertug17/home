export const BASE_CHAIN_ID = 8453 as const;
export const BASE_USDC_ADDRESS =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const BASE_USDC_DECIMALS = 6 as const;
export const NATIVE_ETH_DECIMALS = 18 as const;

export type Address = `0x${string}`;

export type PortfolioAssetBalance =
  | {
      id: "usdc";
      symbol: "USDC";
      decimals: typeof BASE_USDC_DECIMALS;
      kind: "erc20";
      tokenAddress: typeof BASE_USDC_ADDRESS;
      balanceBaseUnits: string;
    }
  | {
      id: "eth";
      symbol: "ETH";
      decimals: typeof NATIVE_ETH_DECIMALS;
      kind: "native";
      balanceBaseUnits: string;
    };

export type PortfolioSnapshot = {
  walletAddress: Address;
  chainId: typeof BASE_CHAIN_ID;
  blockNumber: string;
  blockHash: `0x${string}`;
  blockTimestamp: string;
  fetchedAt: string;
  assets: PortfolioAssetBalance[];
};

export type VerifiedPortfolioAccount = {
  address: Address;
  chainId: typeof BASE_CHAIN_ID;
  verification: "session-smart-account";
};
