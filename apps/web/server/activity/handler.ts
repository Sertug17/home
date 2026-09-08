import {
  ACCOUNT_PROVIDER_HEADER,
  type AccountProvider,
} from "@/features/account/session-types";
import type {
  BaseErc20TransferPage,
  HexAddress,
} from "@/server/chain-data/types";

const BASE_CHAIN_ID = 8453 as const;

export type ActivityAccount = {
  subject: string;
  address: HexAddress;
  accountProvider: AccountProvider;
};

export type ActivityReader = (
  account: ActivityAccount,
  signal?: AbortSignal,
) => Promise<BaseErc20TransferPage>;

const privateResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: `Authorization, ${ACCOUNT_PROVIDER_HEADER}`,
} as const;

export function createActivityHandler(dependencies: {
  authorize: (request: Request) => Promise<Response>;
  readActivity: ActivityReader;
}) {
  return async function GET(request: Request): Promise<Response> {
    const boundaryResponse = await dependencies.authorize(request);
    if (!boundaryResponse.ok) return boundaryResponse;

    const account = await parseAuthorizedAccount(
      boundaryResponse,
      requestedProvider(request),
    );
    if (!account) {
      return privateJson(
        {
          error: {
            code: "AUTH_UNAVAILABLE",
            message: "Authentication is temporarily unavailable.",
          },
        },
        503,
      );
    }

    try {
      return privateJson(
        await dependencies.readActivity(account, request.signal),
        200,
      );
    } catch (error) {
      const code = errorCode(error);
      const notConfigured = code === "not-configured";
      return privateJson(
        {
          error: {
            code: notConfigured
              ? "ACTIVITY_NOT_CONFIGURED"
              : "ACTIVITY_UNAVAILABLE",
            message: notConfigured
              ? "CDP SQL activity is not configured. Set CDP_SQL_AUTH_MODE and its required server credentials."
              : "Supported Base USDC activity is temporarily unavailable.",
          },
        },
        notConfigured ? 503 : 502,
      );
    }
  };
}

async function parseAuthorizedAccount(
  response: Response,
  expectedProvider: AccountProvider | null,
): Promise<ActivityAccount | null> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    !isRecord(value.user) ||
    !isRecord(value.smartAccount) ||
    !expectedProvider ||
    typeof value.user.subject !== "string" ||
    value.user.subject.trim().length === 0 ||
    value.accountProvider !== expectedProvider ||
    typeof value.smartAccount.address !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(value.smartAccount.address) ||
    value.smartAccount.chainId !== BASE_CHAIN_ID
  ) {
    return null;
  }

  return {
    subject: value.user.subject,
    address: value.smartAccount.address.toLowerCase() as HexAddress,
    accountProvider: expectedProvider,
  };
}

function requestedProvider(request: Request): AccountProvider | null {
  const value = request.headers.get(ACCOUNT_PROVIDER_HEADER);
  if (value === null || value === "cdp-embedded") return "cdp-embedded";
  return value === "base-account" ? "base-account" : null;
}

function errorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : null;
}

function privateJson(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: privateResponseHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
