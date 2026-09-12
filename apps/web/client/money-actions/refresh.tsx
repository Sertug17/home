"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { browserHomeQueryClient, useHomeQueryClient } from "@/client/query/query-client";

const MoneyDataRefreshContext = createContext<(() => void) | null>(null);

export function MoneyDataRefreshProvider({
  children,
  onConfirmed,
}: {
  children: ReactNode;
  onConfirmed?: () => void;
}) {
  const queryClient = useHomeQueryClient(browserHomeQueryClient());
  const invalidate = useCallback(() => {
    onConfirmed?.();
    void queryClient.invalidateQueries({
      predicate: (query) => ["valuation", "portfolio", "activity", "savings-positions", "borrow", "actions"]
        .includes(String(query.queryKey[1] ?? "")),
    });
  }, [onConfirmed, queryClient]);
  return (
    <MoneyDataRefreshContext.Provider value={invalidate}>
      {children}
    </MoneyDataRefreshContext.Provider>
  );
}

export function useMoneyDataRefresh(): () => void {
  const provided = useContext(MoneyDataRefreshContext);
  const queryClient = useHomeQueryClient(browserHomeQueryClient());
  return useCallback(() => {
    if (provided) {
      provided();
      return;
    }
    void queryClient.invalidateQueries({
      predicate: (query) => ["valuation", "portfolio", "activity", "savings-positions", "borrow", "actions"]
        .includes(String(query.queryKey[1] ?? "")),
    });
  }, [provided, queryClient]);
}
