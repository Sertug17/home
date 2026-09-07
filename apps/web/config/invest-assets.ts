export const BASE_CHAIN_ID = 8453 as const;

export type InvestAssetCategory = "stock" | "meme";
export type InvestAssetAvailability = "restricted" | "informational";

export type InvestAsset = {
  id: string;
  category: InvestAssetCategory;
  name: string;
  symbol: string;
  initials: string;
  chainId: typeof BASE_CHAIN_ID;
  contractAddress: `0x${string}`;
  availability: InvestAssetAvailability;
  descriptor: string;
  projectUrl?: string;
  contractUrl: string;
};

export const stockAssets = [
  {
    id: "nvdac",
    category: "stock",
    name: "NVIDIA",
    symbol: "NVDAc",
    initials: "NV",
    chainId: BASE_CHAIN_ID,
    contractAddress: "0xb20000000000000000000078ee7ce2fE4908108C",
    availability: "restricted",
    descriptor: "Coinbase Tokenized Stock · Regulation S",
    contractUrl:
      "https://basescan.org/token/0xb20000000000000000000078ee7ce2fE4908108C",
  },
  {
    id: "metac",
    category: "stock",
    name: "Meta",
    symbol: "METAc",
    initials: "ME",
    chainId: BASE_CHAIN_ID,
    contractAddress: "0xb2000000000000000000008bC8786B856E61707C",
    availability: "restricted",
    descriptor: "Coinbase Tokenized Stock · Regulation S",
    contractUrl:
      "https://basescan.org/token/0xb2000000000000000000008bC8786B856E61707C",
  },
  {
    id: "aaplc",
    category: "stock",
    name: "Apple",
    symbol: "AAPLc",
    initials: "AP",
    chainId: BASE_CHAIN_ID,
    contractAddress: "0xb200000000000000000000C2e324d24d7eEcd1fb",
    availability: "restricted",
    descriptor: "Coinbase Tokenized Stock · Regulation S",
    contractUrl:
      "https://basescan.org/token/0xb200000000000000000000C2e324d24d7eEcd1fb",
  },
  {
    id: "googlc",
    category: "stock",
    name: "Alphabet",
    symbol: "GOOGLc",
    initials: "GO",
    chainId: BASE_CHAIN_ID,
    contractAddress: "0xb2000000000000000000002D0BA3164cc74f58B7",
    availability: "restricted",
    descriptor: "Coinbase Tokenized Stock · Regulation S",
    contractUrl:
      "https://basescan.org/token/0xb2000000000000000000002D0BA3164cc74f58B7",
  },
] as const satisfies readonly InvestAsset[];

export const memeAssets = [
  {
    id: "degen",
    category: "meme",
    name: "Degen",
    symbol: "DEGEN",
    initials: "DE",
    chainId: BASE_CHAIN_ID,
    contractAddress: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
    availability: "informational",
    descriptor: "Farcaster-born community token",
    projectUrl: "https://www.degen.tips/",
    contractUrl:
      "https://basescan.org/token/0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
  },
  {
    id: "toshi",
    category: "meme",
    name: "Toshi",
    symbol: "TOSHI",
    initials: "TO",
    chainId: BASE_CHAIN_ID,
    contractAddress: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4",
    availability: "informational",
    descriptor: "Community meme and utility token",
    projectUrl: "https://www.toshithecat.com/",
    contractUrl:
      "https://basescan.org/token/0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4",
  },
] as const satisfies readonly InvestAsset[];

export const investAssets = [...stockAssets, ...memeAssets] as const;

export type InvestAssetId = (typeof investAssets)[number]["id"];

export const investSources = {
  stockRoster: {
    label: "Official Base stock roster",
    url: "https://www.base.org/stocks",
  },
  stockAnnouncement: {
    label: "Base stock announcement",
    url: "https://blog.base.org/tokenized-stocks",
  },
} as const;

export function shortenContractAddress(address: `0x${string}`): string {
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}
