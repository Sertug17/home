import type { AccountProvider } from "@/features/account/session-types";
import {
  FUNDING_BASE_CHAIN_ID,
  FUNDING_BASE_USDC_ADDRESS,
  type HostedOnrampSession,
} from "./types";

export const FUNDING_ATTEMPT_STORAGE_KEY = "home:funding-attempt:v1";

export type FundingAttempt = {
  version: 1;
  accountProvider: AccountProvider;
  address: `0x${string}`;
  startedAt: string;
  baselineUsdcBaseUnits: string | null;
};

export type FundingAccountResource = (
  path: string,
  options?: {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
  },
) => Promise<unknown>;

export class FundingRequestError extends Error {
  readonly code:
    | "unauthenticated"
    | "not-configured"
    | "unavailable"
    | "invalid-response";

  constructor(code: FundingRequestError["code"]) {
    super(code);
    this.name = "FundingRequestError";
    this.code = code;
  }
}

export async function requestHostedOnrampSession(options: {
  fetchAccountResource: FundingAccountResource;
  signal?: AbortSignal;
}): Promise<HostedOnrampSession> {
  let value: unknown;
  try {
    value = await options.fetchAccountResource(
      "/api/funding/onramp-session",
      {
        method: "POST",
        body: { assetId: "usdc" },
        signal: options.signal,
      },
    );
  } catch (error) {
    const status = readErrorStatus(error);
    throw new FundingRequestError(
      status === 401
        ? "unauthenticated"
        : status === 424
          ? "not-configured"
          : "unavailable",
    );
  }
  return parseHostedOnrampSession(value);
}

export function parseHostedOnrampSession(value: unknown): HostedOnrampSession {
  if (!isRecord(value) || !isRecord(value.asset) || !isRecord(value.network)) {
    throw new FundingRequestError("invalid-response");
  }
  const url = parseCoinbaseHostedUrl(value.url);
  if (
    value.asset.id !== "usdc" ||
    value.asset.symbol !== "USDC" ||
    value.asset.decimals !== 6 ||
    value.asset.tokenAddress !== FUNDING_BASE_USDC_ADDRESS ||
    value.network.name !== "Base" ||
    value.network.chainId !== FUNDING_BASE_CHAIN_ID
  ) {
    throw new FundingRequestError("invalid-response");
  }
  return {
    url,
    asset: {
      id: "usdc",
      symbol: "USDC",
      decimals: 6,
      tokenAddress: FUNDING_BASE_USDC_ADDRESS,
    },
    network: { name: "Base", chainId: FUNDING_BASE_CHAIN_ID },
  };
}

export function parseCoinbaseHostedUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096) {
    throw new FundingRequestError("invalid-response");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FundingRequestError("invalid-response");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "pay.coinbase.com" ||
    (url.pathname !== "/buy" && url.pathname !== "/buy/select-asset") ||
    !url.searchParams.has("sessionToken") ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new FundingRequestError("invalid-response");
  }
  return url.toString();
}

export function readFundingAttempt(
  storage: Pick<Storage, "getItem" | "removeItem">,
  expected: { accountProvider: AccountProvider; address: `0x${string}` },
): FundingAttempt | null {
  let raw: string | null;
  try {
    raw = storage.getItem(FUNDING_ATTEMPT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) throw new Error("invalid");
    const attempt: FundingAttempt = {
      version: value.version === 1 ? 1 : fail(),
      accountProvider:
        value.accountProvider === "base-account" ||
        value.accountProvider === "cdp-embedded"
          ? value.accountProvider
          : fail(),
      address: readAddress(value.address),
      startedAt: readTimestamp(value.startedAt),
      baselineUsdcBaseUnits: readOptionalInteger(value.baselineUsdcBaseUnits),
    };
    if (
      attempt.accountProvider !== expected.accountProvider ||
      attempt.address !== expected.address.toLowerCase()
    ) {
      storage.removeItem(FUNDING_ATTEMPT_STORAGE_KEY);
      return null;
    }
    return attempt;
  } catch {
    try {
      storage.removeItem(FUNDING_ATTEMPT_STORAGE_KEY);
    } catch {}
    return null;
  }
}

export function writeFundingAttempt(
  storage: Pick<Storage, "setItem">,
  attempt: FundingAttempt,
): void {
  try {
    storage.setItem(FUNDING_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
  } catch {
    // Funding still works when session storage is unavailable; return comparison will be limited.
  }
}

function readErrorStatus(error: unknown): number | null {
  return error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : null;
}

function readAddress(value: unknown): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) fail();
  return value.toLowerCase() as `0x${string}`;
}

function readTimestamp(value: unknown): string {
  if (typeof value !== "string") fail();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) fail();
  return value;
}

function readOptionalInteger(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) fail();
  return value;
}

function fail(): never {
  throw new Error("invalid");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
