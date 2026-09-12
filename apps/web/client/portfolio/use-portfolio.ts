"use client";

import { isVerifiedPortfolioSession, parsePortfolioSnapshot } from "./parse";
import { ownerQueryKey, ownerQueryMeta, useHomeQuery } from "@/client/query/query-client";
import type {
  FetchPortfolio,
  PortfolioState,
  VerifiedPortfolioSession,
} from "@/shared/portfolio/types";

export const portfolioStaleTimeMs = 15_000;

export type PortfolioQuerySession = VerifiedPortfolioSession & { accountProvider?: string };

export function portfolioOwnerKey(session: PortfolioQuerySession): string {
  const baseOwner = `${session.subject}\u0000${session.smartAccountAddress.toLowerCase()}\u0000${session.chainId}`;
  return session.accountProvider ? `${baseOwner}\u0000${session.accountProvider}` : baseOwner;
}

export function usePortfolio(
  session: PortfolioQuerySession | null,
  fetchPortfolio: FetchPortfolio,
): PortfolioState {
  const validSession = isVerifiedPortfolioSession(session) ? session : null;
  const ownerKey = validSession ? portfolioOwnerKey(validSession) : null;
  const query = useHomeQuery({
    queryKey: ownerKey ? ownerQueryKey(ownerKey, "portfolio") : ["unauthenticated", "portfolio-disabled"],
    enabled: ownerKey !== null,
    staleTime: portfolioStaleTimeMs,
    retry: false,
    refetchOnWindowFocus: true,
    meta: ownerKey ? ownerQueryMeta(ownerKey, "owner") : undefined,
    queryFn: async ({ signal }) => {
      if (!validSession) throw new Error("Portfolio is unavailable.");
      return fetchPortfolio(signal);
    },
    select: (value) => {
      if (!validSession) throw new Error("Portfolio is unavailable.");
      return parsePortfolioSnapshot(value, validSession);
    },
  });

  if (!ownerKey) return { status: "unavailable", snapshot: null, error: null };
  if (query.isPending) return { status: "loading", snapshot: null, error: null };
  if (query.isError) return { status: "error", snapshot: null, error: "portfolio-unavailable" };
  return { status: "ready", snapshot: query.data, error: null };
}
