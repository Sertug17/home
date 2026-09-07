import type { InvestAsset } from "./invest-assets";

export type AssetPresentation = {
  primaryName: string;
  primarySymbol: string;
  tokenLabel: string;
  networkLabel: string;
  priceUnitLabel: string;
};

export function getAssetPresentation(
  asset: InvestAsset,
): AssetPresentation {
  const tokenSymbol = asset.representation.tokenSymbol;

  return {
    primaryName: asset.displayName,
    primarySymbol: asset.displaySymbol,
    tokenLabel:
      tokenSymbol === asset.displaySymbol
        ? `${tokenSymbol} token`
        : `${tokenSymbol} token representation`,
    networkLabel: `Base ${asset.chainId}`,
    priceUnitLabel: `Per ${tokenSymbol} token`,
  };
}
