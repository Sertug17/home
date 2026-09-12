"use client";

import { useCallback, useEffect, useRef } from "react";
import type {
  AccountResourceOptions,
  AccountSessionStatus,
} from "./cdp-client";
import type { OwnerGenerationFence } from "./cdp-session-lifecycle";
import type { SessionFetch, VerifiedAccountSession } from "./session-client";
import { ACCOUNT_PROVIDER_HEADER } from "@/shared/account/session-types";
import { TransferExecutionError } from "@/shared/transfers/types";
import { browserHomeQueryClient, useHomeQueryClient, ownerQueryKey, ownerQueryMeta } from "@/client/query/query-client";
import { freshUntilMoved, type BalanceSnapshot } from "@/client/query/fresh-until-moved";
import { parsePortfolioValuationSnapshot } from "@/shared/portfolio/parse-valuation";
import type { PortfolioValuationSnapshot } from "@/shared/portfolio/valuation-types";

type MoneyActionApiFetch = (path: string, init?: RequestInit) => Promise<unknown>;

export function accountAuthorizationBoundary(
  ownerKey: string,
  session: VerifiedAccountSession,
): string | null {
  return session.smartAccount
    ? `${ownerKey}\u0000${session.user.subject}\u0000${session.smartAccount.address}\u0000${session.accountProvider}`
    : null;
}

const accountResourcePrefixes = [
  "/api/actions",
  "/api/savings/actions",
  "/api/trades",
  "/api/borrow",
  "/api/funding",
] as const;

export function normalizeAccountResourcePath(path: string): string {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("#") ||
    /(?:^|\/)\.\.?($|\/)|%2e|%2f|%5c/i.test(path)
  ) {
    throw new TransferExecutionError("invalid-request");
  }
  let url: URL;
  try {
    url = new URL(path, "https://home.invalid");
  } catch {
    throw new TransferExecutionError("invalid-request");
  }
  if (
    url.origin !== "https://home.invalid" ||
    !accountResourcePrefixes.some(
      (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
    )
  ) {
    throw new TransferExecutionError("invalid-request");
  }
  return `${url.pathname}${url.search}`;
}

function responseErrorDetails(payload: unknown): {
  code: string | null;
  serverMessage: string | null;
} {
  let code: string | null = null;
  let serverMessage: string | null = null;
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object"
  ) {
    const error = payload.error;
    if ("code" in error && typeof error.code === "string") code = error.code;
    if ("message" in error && typeof error.message === "string") {
      serverMessage = error.message;
    }
  }
  return { code, serverMessage };
}

export function useAuthenticatedTransport({
  session,
  status,
  ownerKey,
  ownerFence,
  getAccessToken,
  sessionFetch,
  authentication = "cdp",
}: {
  session: VerifiedAccountSession | null;
  status: AccountSessionStatus;
  ownerKey: string | null;
  ownerFence: OwnerGenerationFence;
  getAccessToken: () => Promise<string | null>;
  sessionFetch?: SessionFetch;
  authentication?: "cdp" | "native-base";
}) {
  const queryClient = useHomeQueryClient(browserHomeQueryClient());
  const freshnessRuns = useRef(new Map<string, () => void>());
  const reset = useCallback(() => {
    for (const cancel of freshnessRuns.current.values()) cancel();
    freshnessRuns.current.clear();
  }, []);
  useEffect(() => reset, [reset]);

  const fetchVerifiedResource = useCallback(
    async (
      endpoint:
        | "/api/portfolio"
        | "/api/portfolio/valuation"
        | "/api/activity"
        | "/api/savings/positions"
        | "/api/actions",
      signal?: AbortSignal,
      query?: string,
    ): Promise<unknown> => {
      if (!session || status !== "verified" || !ownerKey) {
        throw new Error("Authenticated resource is unavailable.");
      }
      const accessToken = await getAccessToken();
      if (authentication === "cdp" && !accessToken) {
        throw new Error("Authenticated resource is unavailable.");
      }

      let response: Response;
      try {
        response = await (sessionFetch ?? fetch)(
          query ? `${endpoint}?${query}` : endpoint,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              ...(authentication === "cdp" ? { Authorization: `Bearer ${accessToken}` } : {}),
              [ACCOUNT_PROVIDER_HEADER]: session.accountProvider,
            },
            cache: "no-store",
            credentials: "same-origin",
            signal,
          },
        );
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new Error("Authenticated resource is unavailable.");
      }
      if (!response.ok) {
        let details = { code: null as string | null, serverMessage: null as string | null };
        try {
          details = responseErrorDetails(await response.json());
        } catch {
          // Fixed-endpoint callers only need the bounded status/code seam.
        }
        const unavailable = new Error("Authenticated resource is unavailable.");
        Object.assign(unavailable, { status: response.status, ...details });
        throw unavailable;
      }
      try {
        return await response.json();
      } catch {
        throw new Error("Authenticated resource is unavailable.");
      }
    },
    [authentication, getAccessToken, ownerKey, session, sessionFetch, status],
  );

  const startBalanceFreshness = useCallback(async (actionId: string) => {
    if (!session?.smartAccount || !ownerKey) return;
    const dataOwnerKey = `${session.user.subject}\u0000${session.smartAccount.address.toLowerCase()}\u00008453\u0000${session.accountProvider}`;
    const portfolioOwner = dataOwnerKey;
    let actionsValue: unknown;
    try {
      actionsValue = await fetchVerifiedResource("/api/actions");
    } catch {
      return;
    }
    const assetIds = affectedAssetIds(actionsValue, actionId);
    if (assetIds.length === 0) return;
    const valuationQueries = queryClient.getQueryCache().findAll({
      queryKey: [portfolioOwner, "valuation"],
    });
    const firstSnapshot = valuationQueries
      .map((query) => query.state.data)
      .find(isPortfolioValuationSnapshot);
    if (!firstSnapshot) return;
    const initial = selectAffectedBalances(firstSnapshot, assetIds);
    const run = freshUntilMoved({
      initial,
      readFresh: async () => {
        let latest = initial;
        for (const valuationQuery of valuationQueries) {
          const region = valuationQuery.queryKey[2];
          if (typeof region !== "string") continue;
          const snapshot = await queryClient.fetchQuery({
            queryKey: valuationQuery.queryKey,
            staleTime: 0,
            retry: false,
            // Must stay memory-only: fetchQuery's options overwrite the hook's meta,
            // and the valuation payload includes recognized rows that are never persisted.
            meta: ownerQueryMeta(portfolioOwner, "memory"),
            queryFn: async ({ signal }) => parsePortfolioValuationSnapshot(
              await fetchVerifiedResource(
                "/api/portfolio/valuation",
                signal,
                new URLSearchParams({ region, fresh: "1" }).toString(),
              ),
              {
                subject: session.user.subject,
                smartAccountAddress: session.smartAccount!.address,
                chainId: 8453,
              },
              region as import("@/config/regions").RegionId,
            ),
          });
          latest = selectAffectedBalances(snapshot, assetIds);
        }
        return latest;
      },
    });
    freshnessRuns.current.get(actionId)?.();
    freshnessRuns.current.set(actionId, run.cancel);
    void run.result.finally(() => {
      if (freshnessRuns.current.get(actionId) === run.cancel) freshnessRuns.current.delete(actionId);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ownerQueryKey(dataOwnerKey, "activity") }),
        queryClient.invalidateQueries({ queryKey: ownerQueryKey(dataOwnerKey, "savings-positions") }),
        queryClient.invalidateQueries({ queryKey: ownerQueryKey(dataOwnerKey, "borrow") }),
        queryClient.invalidateQueries({ queryKey: ownerQueryKey(dataOwnerKey, "actions") }),
      ]);
    });
  }, [fetchVerifiedResource, ownerKey, queryClient, session]);

  const fetchAccountResource = useCallback(
    async (path: string, options: AccountResourceOptions = {}): Promise<unknown> => {
      const safePath = normalizeAccountResourcePath(path);
      if (!session?.smartAccount || status !== "verified" || !ownerKey) {
        throw new TransferExecutionError("stale-session");
      }
      const boundary = accountAuthorizationBoundary(ownerKey, session);
      const identity = ownerFence.capture(ownerKey, boundary);
      const assertActive = () => {
        if (!ownerFence.isCurrent(identity)) {
          throw new TransferExecutionError("stale-session");
        }
      };
      assertActive();
      const accessToken = await getAccessToken();
      assertActive();
      if (authentication === "cdp" && !accessToken) throw new TransferExecutionError("stale-session");
      const method = options.method ?? "GET";
      if (method === "GET" && options.body !== undefined) {
        throw new TransferExecutionError("invalid-request");
      }
      let response: Response;
      try {
        response = await (sessionFetch ?? fetch)(safePath, {
          method,
          headers: {
            Accept: "application/json",
            ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
            ...(authentication === "cdp" ? { Authorization: `Bearer ${accessToken}` } : {}),
            [ACCOUNT_PROVIDER_HEADER]: session.accountProvider,
          },
          ...(method === "POST" ? { body: JSON.stringify(options.body ?? {}) } : {}),
          cache: "no-store",
          credentials: "same-origin",
          redirect: "error",
          signal: options.signal,
        });
      } catch (error) {
        if (options.signal?.aborted) throw error;
        if (error instanceof TransferExecutionError) throw error;
        throw new TransferExecutionError("unavailable", error);
      }
      assertActive();
      if (!response.ok) {
        let details = { code: null as string | null, serverMessage: null as string | null };
        try {
          details = responseErrorDetails(await response.json());
        } catch {
          // Money-action callers only need the bounded status/code seam.
        }
        const failure = new TransferExecutionError(
          response.status === 409 ? "submission-pending" : "unavailable",
        );
        Object.assign(failure, { status: response.status, ...details });
        throw failure;
      }
      try {
        const value = await response.json();
        assertActive();
        if (/^\/api\/actions\/[^/]+\/handle$/.test(new URL(safePath, "https://home.invalid").pathname)) {
          const dataOwnerKey = `${session.user.subject}\u0000${session.smartAccount.address.toLowerCase()}\u00008453\u0000${session.accountProvider}`;
          void queryClient.invalidateQueries({ queryKey: ownerQueryKey(dataOwnerKey, "actions") });
          if (isRecord(options.body) && typeof options.body.transactionHash === "string") {
            const actionId = new URL(safePath, "https://home.invalid").pathname.split("/")[3];
            if (actionId) void startBalanceFreshness(actionId);
          }
        }
        return value;
      } catch (error) {
        if (error instanceof TransferExecutionError) throw error;
        throw new TransferExecutionError("unavailable", error);
      }
    },
    [authentication, getAccessToken, ownerFence, ownerKey, queryClient, session, sessionFetch, startBalanceFreshness, status],
  );

  const fetchMoneyActionApi = useCallback<MoneyActionApiFetch>(
    (path, init = {}) =>
      fetchAccountResource(path, {
        method: init.method === "POST" ? "POST" : "GET",
        ...(init.body === undefined ? {} : { body: JSON.parse(String(init.body)) }),
        ...(init.signal ? { signal: init.signal } : {}),
      }),
    [fetchAccountResource],
  );

  const fetchPortfolio = useCallback(
    (signal?: AbortSignal) => fetchVerifiedResource("/api/portfolio", signal),
    [fetchVerifiedResource],
  );
  const fetchPortfolioValuation = useCallback(
    (region: import("@/config/regions").RegionId, signal?: AbortSignal) =>
      fetchVerifiedResource(
        "/api/portfolio/valuation",
        signal,
        new URLSearchParams({ region }).toString(),
      ),
    [fetchVerifiedResource],
  );
  const fetchActivity = useCallback(
    (query: string, signal?: AbortSignal) =>
      fetchVerifiedResource("/api/activity", signal, query),
    [fetchVerifiedResource],
  );
  const fetchSavingsPositions = useCallback(
    (signal?: AbortSignal) =>
      fetchVerifiedResource("/api/savings/positions", signal),
    [fetchVerifiedResource],
  );

  return {
    fetchPortfolio,
    fetchPortfolioValuation,
    fetchActivity,
    fetchSavingsPositions,
    fetchAccountResource,
    fetchMoneyActionApi,
    reset,
  };
}

function affectedAssetIds(value: unknown, actionId: string): string[] {
  if (!isRecord(value) || !Array.isArray(value.actions)) return [];
  const action = value.actions.find((item) => isRecord(item) && item.id === actionId);
  if (!isRecord(action) || !isRecord(action.summary) || !Array.isArray(action.summary.amounts)) return [];
  return Array.from(new Set(action.summary.amounts.flatMap((amount) =>
    isRecord(amount) && typeof amount.assetId === "string" ? [amount.assetId] : [],
  )));
}

function selectAffectedBalances(
  snapshot: PortfolioValuationSnapshot,
  assetIds: readonly string[],
): BalanceSnapshot {
  const requested = new Set(assetIds);
  const result: Record<string, string | null> = Object.fromEntries(
    assetIds.map((assetId) => [assetId, null]),
  );
  for (const holding of snapshot.inventory.holdings) {
    if (!requested.has(holding.id)) continue;
    result[holding.id] = holding.kind === "direct"
      ? holding.balanceBaseUnits
      : holding.sharesBaseUnits;
  }
  return result;
}

function isPortfolioValuationSnapshot(value: unknown): value is PortfolioValuationSnapshot {
  return isRecord(value) && value.version === 2 && isRecord(value.inventory) &&
    Array.isArray(value.inventory.holdings);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export type AuthenticatedTransport = ReturnType<typeof useAuthenticatedTransport>;
