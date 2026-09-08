import {
  PORTFOLIO_NATIVE_ASSET_KEY,
  PORTFOLIO_USDC_ASSET_KEY,
} from "@/config/portfolio-assets";
import { presentationRegions, type RegionId } from "@/config/regions";
import type { PortfolioValuationSnapshot } from "./types";
import type { VerifiedPortfolioSession } from "@/features/portfolio";

const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const blockHashPattern = /^0x[0-9a-fA-F]{64}$/;
const decimalIntegerPattern = /^(?:0|[1-9]\d*)$/;
const assetKeyPattern = /^(?:eip155:8453\/native|eip155:8453\/erc20:0x[0-9a-f]{40})$/;

export class PortfolioValuationResponseError extends Error {
  constructor() {
    super("The portfolio valuation response is invalid.");
    this.name = "PortfolioValuationResponseError";
  }
}

export function parsePortfolioValuationSnapshot(
  value: unknown,
  expectedSession: VerifiedPortfolioSession,
  expectedRegion: RegionId,
): PortfolioValuationSnapshot {
  if (!isRecord(value)) fail();
  const expectedCurrency = presentationRegions[expectedRegion].currency.code;
  if (
    value.version !== 2 ||
    value.chainId !== 8453 ||
    value.selectedRegion !== expectedRegion ||
    value.quoteCurrency !== expectedCurrency ||
    typeof value.walletAddress !== "string" ||
    !addressPattern.test(value.walletAddress) ||
    value.walletAddress.toLowerCase() !==
      expectedSession.smartAccountAddress.toLowerCase() ||
    !isRecord(value.block) ||
    !readInteger(value.block.number) ||
    typeof value.block.hash !== "string" ||
    !blockHashPattern.test(value.block.hash) ||
    !readInteger(value.block.timestamp) ||
    !readIso(value.fetchedAt) ||
    !isRecord(value.inventory) ||
    value.inventory.scope !== "configured-base-assets-v1" ||
    value.inventory.walletDiscoveryComplete !== false ||
    !Array.isArray(value.inventory.holdings) ||
    !Array.isArray(value.inventory.omissions) ||
    !Array.isArray(value.prices) ||
    !Array.isArray(value.lines) ||
    !Array.isArray(value.cashBuckets) ||
    !isRecord(value.nativeEthQuote) ||
    !isRecord(value.total)
  ) {
    fail();
  }

  const holdingKeys = new Set<string>();
  for (const holding of value.inventory.holdings) {
    if (!validateHolding(holding)) fail();
    if (holdingKeys.has(holding.assetKey)) fail();
    holdingKeys.add(holding.assetKey);
  }
  if (
    !holdingKeys.has(PORTFOLIO_NATIVE_ASSET_KEY) ||
    !holdingKeys.has(PORTFOLIO_USDC_ASSET_KEY) ||
    value.inventory.holdings.filter(
      (holding) => isRecord(holding) && holding.kind === "vault-position",
    ).length !== 3
  ) {
    fail();
  }
  for (const omission of value.inventory.omissions) {
    if (
      !isRecord(omission) ||
      typeof omission.code !== "string" ||
      typeof omission.assetOrScope !== "string" ||
      typeof omission.reason !== "string"
    ) {
      fail();
    }
  }
  for (const price of value.prices) if (!validatePrice(price)) fail();
  if (value.fx !== null && !validateFx(value.fx, expectedCurrency)) fail();
  if (!validateNativeEthQuote(value.nativeEthQuote)) fail();
  for (const line of value.lines) {
    if (!validateLine(line, expectedCurrency, holdingKeys)) fail();
  }
  for (const bucket of value.cashBuckets) if (!validateCashBucket(bucket)) fail();
  if (!validateTotal(value.total, expectedCurrency, holdingKeys)) fail();

  return value as PortfolioValuationSnapshot;
}

function validateHolding(
  value: unknown,
): value is Record<string, unknown> & { assetKey: string } {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.assetKey !== "string" ||
    !assetKeyPattern.test(value.assetKey) ||
    typeof value.name !== "string" ||
    typeof value.symbol !== "string" ||
    (value.readStatus !== "ready" && value.readStatus !== "unavailable")
  ) {
    return false;
  }
  if (value.kind === "direct") {
    return (
      Number.isInteger(value.decimals) &&
      (value.assetKind === "native" || value.assetKind === "erc20") &&
      (value.contractAddress === null ||
        (typeof value.contractAddress === "string" &&
          addressPattern.test(value.contractAddress))) &&
      (value.cashCurrency === null || typeof value.cashCurrency === "string") &&
      (value.balanceBaseUnits === null || readInteger(value.balanceBaseUnits))
    );
  }
  return (
    value.kind === "vault-position" &&
    typeof value.vaultAddress === "string" &&
    addressPattern.test(value.vaultAddress) &&
    value.underlyingAssetKey === PORTFOLIO_USDC_ASSET_KEY &&
    value.underlyingSymbol === "USDC" &&
    value.underlyingDecimals === 6 &&
    (value.sharesBaseUnits === null || readInteger(value.sharesBaseUnits)) &&
    (value.underlyingBaseUnits === null || readInteger(value.underlyingBaseUnits)) &&
    value.conversionMethod === "erc4626-convertToAssets"
  );
}

function validatePrice(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.assetKey === "string" &&
    /^eip155:8453\/erc20:0x[0-9a-f]{40}$/.test(value.assetKey) &&
    typeof value.contractAddress === "string" &&
    addressPattern.test(value.contractAddress) &&
    value.quoteCurrency === "USD" &&
    validateNullableDecimal(value.unitPrice) &&
    (value.sourceValue === null || typeof value.sourceValue === "string") &&
    ["fresh", "missing", "stale", "invalid", "unavailable"].includes(
      String(value.status),
    ) &&
    validateSource(value.source)
  );
}

function validateFx(value: unknown, currency: string | null): boolean {
  return (
    isRecord(value) &&
    currency !== null &&
    value.baseCurrency === "USD" &&
    value.quoteCurrency === currency &&
    validateNullableDecimal(value.quoteUnitsPerUsd) &&
    (value.sourceValue === null || typeof value.sourceValue === "string") &&
    ["fresh", "missing", "invalid", "unavailable"].includes(
      String(value.status),
    ) &&
    validateSource(value.source)
  );
}

function validateNativeEthQuote(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.baseCurrency === "USD" &&
    value.assetSymbol === "ETH" &&
    validateNullableDecimal(value.assetUnitsPerUsd) &&
    (value.sourceValue === null || typeof value.sourceValue === "string") &&
    ["fresh", "missing", "invalid", "unavailable"].includes(
      String(value.status),
    ) &&
    validateSource(value.source)
  );
}

function validateLine(
  value: unknown,
  currency: string | null,
  holdingKeys: Set<string>,
): boolean {
  return (
    currency !== null &&
    isRecord(value) &&
    typeof value.holdingAssetKey === "string" &&
    holdingKeys.has(value.holdingAssetKey) &&
    value.valueCurrency === currency &&
    validateNullableDecimal(value.value) &&
    ["priced", "unpriced", "read-unavailable"].includes(String(value.status)) &&
    (value.reason === null || typeof value.reason === "string")
  );
}

function validateCashBucket(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.roles) &&
    value.roles.every(
      (role) => role === "canonical-usd" || role === "selected-local",
    ) &&
    (value.assetKey === null ||
      (typeof value.assetKey === "string" &&
        /^eip155:8453\/erc20:0x[0-9a-f]{40}$/.test(value.assetKey))) &&
    typeof value.symbol === "string" &&
    typeof value.denominationCurrency === "string" &&
    (value.tokenAmountBaseUnits === null || readInteger(value.tokenAmountBaseUnits)) &&
    (value.tokenDecimals === null || Number.isInteger(value.tokenDecimals)) &&
    validateNullableDecimal(value.indicativeValue) &&
    ["priced", "unpriced", "read-unavailable", "unsupported"].includes(
      String(value.valuationStatus),
    )
  );
}

function validateTotal(
  value: unknown,
  currency: string | null,
  holdingKeys: Set<string>,
): boolean {
  return (
    isRecord(value) &&
    value.label === "supported-portfolio-value" &&
    [
      "all-supported-read-holdings-priced",
      "partial",
      "unavailable-no-quote-currency",
      "unavailable",
    ].includes(String(value.status)) &&
    value.currency === currency &&
    validateNullableDecimal(value.value) &&
    Array.isArray(value.unpricedAssetKeys) &&
    value.unpricedAssetKeys.every(
      (key) => typeof key === "string" && holdingKeys.has(key),
    ) &&
    Array.isArray(value.unavailableAssetKeys) &&
    value.unavailableAssetKeys.every(
      (key) => typeof key === "string" && holdingKeys.has(key),
    )
  );
}

function validateNullableDecimal(value: unknown): boolean {
  return value === null || validateDecimal(value);
}

function validateDecimal(value: unknown): boolean {
  return (
    isRecord(value) &&
    readInteger(value.atoms) &&
    Number.isInteger(value.scale) &&
    typeof value.scale === "number" &&
    value.scale >= 0 &&
    value.scale <= 100
  );
}

function validateSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    ["Base JSON-RPC", "Codex", "Coinbase Exchange Rates"].includes(
      String(value.provider),
    ) &&
    typeof value.method === "string" &&
    readIso(value.fetchedAt) &&
    (value.asOf === null || readIso(value.asOf)) &&
    ["block", "provider-as-of", "retrieved-at"].includes(String(value.timeBasis))
  );
}

function readInteger(value: unknown): value is string {
  return typeof value === "string" && decimalIntegerPattern.test(value);
}

function readIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function fail(): never {
  throw new PortfolioValuationResponseError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
