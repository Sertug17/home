import { describe, expect, test } from "bun:test";
import {
  BASE_CHAIN_ID,
  investAssets,
  memeAssets,
  shortenContractAddress,
  stockAssets,
} from "./invest-assets";

const evmAddressPattern = /^0x[0-9a-fA-F]{40}$/;

describe("invest asset registry", () => {
  test("keeps the approved stock roster and Base identities", () => {
    expect(stockAssets.map((asset) => asset.symbol)).toEqual([
      "NVDAc",
      "METAc",
      "AAPLc",
      "GOOGLc",
    ]);

    for (const asset of stockAssets) {
      expect(asset.chainId).toBe(BASE_CHAIN_ID);
      expect(asset.contractAddress).toMatch(evmAddressPattern);
      expect(asset.availability).toBe("restricted");
      expect(asset.descriptor).toContain("Regulation S");
    }
  });

  test("keeps memes informational and linked to primary project sources", () => {
    expect(memeAssets.map((asset) => asset.symbol)).toEqual(["DEGEN", "TOSHI"]);

    for (const asset of memeAssets) {
      expect(asset.chainId).toBe(BASE_CHAIN_ID);
      expect(asset.contractAddress).toMatch(evmAddressPattern);
      expect(asset.availability).toBe("informational");
      expect(asset.projectUrl?.startsWith("https://")).toBe(true);
      expect(asset.contractUrl).toContain("basescan.org/token/");
    }
  });

  test("does not duplicate contract identities", () => {
    const identities = investAssets.map(
      (asset) => `${asset.chainId}:${asset.contractAddress.toLowerCase()}`,
    );

    expect(new Set(identities).size).toBe(identities.length);
  });

  test("truncates only presentation text without changing the registry value", () => {
    const address = stockAssets[0].contractAddress;
    expect(shortenContractAddress(address)).toBe("0xb20000…108C");
    expect(address).toBe("0xb20000000000000000000078ee7ce2fE4908108C");
  });
});
