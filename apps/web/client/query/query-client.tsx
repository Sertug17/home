"use client";

import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type Query,
  type QueryKey,
} from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useEffect, useState, type ReactNode } from "react";

export const ownerQueryCachePrefix = "home.query.v1:";
export const ownerQueryCacheTtlMs = 24 * 60 * 60 * 1000;
const forbiddenIdentityPattern = /authorization|bearer\s|eyj[a-z0-9_-]{10,}\./i;
const maxIdentityLength = 200;

export type HomeQueryMeta = {
  persistence?: "memory" | "owner";
  ownerKey?: string;
};

export function isSafeQueryIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxIdentityLength &&
    !value.includes("\n") && !value.includes("\r") && !forbiddenIdentityPattern.test(value);
}

export function ownerQueryKey(ownerKey: string, scope: string, ...parts: readonly unknown[]): QueryKey {
  return [ownerKey, scope, ...parts];
}

export function publicQueryKey(scope: string, ...parts: readonly unknown[]): QueryKey {
  return ["unauthenticated", scope, ...parts];
}

export function ownerQueryMeta(ownerKey: string, persistence: "memory" | "owner" = "owner"): HomeQueryMeta {
  return { persistence, ownerKey };
}

export function shouldPersistOwnerQuery(query: Query, ownerKey: string, now = Date.now()): boolean {
  const meta = query.meta as HomeQueryMeta | undefined;
  return isSafeQueryIdentity(ownerKey) && meta?.persistence === "owner" && meta.ownerKey === ownerKey &&
    query.queryKey[0] === ownerKey && query.state.status === "success" &&
    now - query.state.dataUpdatedAt <= ownerQueryCacheTtlMs;
}

export function ownerQueryStorageKey(ownerKey: string): string | null {
  return isSafeQueryIdentity(ownerKey)
    ? `${ownerQueryCachePrefix}${encodeURIComponent(ownerKey)}`
    : null;
}

export function createOwnerQueryPersister(storage: Storage, ownerKey: string) {
  const key = ownerQueryStorageKey(ownerKey);
  if (!key) return null;
  return createSyncStoragePersister({ storage, key, throttleTime: 0 });
}

export function clearPersistedOwnerQueries(storage: Pick<Storage, "length" | "key" | "removeItem">): void {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(ownerQueryCachePrefix)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

export function clearOwnerQueryBoundary(queryClient: QueryClient, storage?: Storage): void {
  queryClient.clear();
  if (storage) clearPersistedOwnerQueries(storage);
}

export function OwnerQueryPersistence({ ownerKey }: { ownerKey: string | null }) {
  const queryClient = useQueryClient(browserHomeQueryClient());
  useEffect(() => {
    if (!ownerKey || typeof window === "undefined") return;
    const persister = createOwnerQueryPersister(window.localStorage, ownerKey);
    if (!persister) return;
    let active = true;
    void Promise.resolve(persister.restoreClient?.()).then((persisted) => {
      if (!active || !persisted || Date.now() - persisted.timestamp > ownerQueryCacheTtlMs) return;
      hydrate(queryClient, persisted.clientState);
    });
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (!active) return;
      void persister.persistClient({
        timestamp: Date.now(),
        buster: "home-query-v1",
        clientState: dehydrate(queryClient, {
          shouldDehydrateQuery: (query) => shouldPersistOwnerQuery(query, ownerKey),
        }),
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [ownerKey, queryClient]);
  return null;
}

let sharedClient: QueryClient | null = null;

export function createHomeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

export function browserHomeQueryClient(): QueryClient | undefined {
  return typeof window === "undefined" ? undefined : getHomeQueryClient();
}

export function getHomeQueryClient(): QueryClient {
  sharedClient ??= createHomeQueryClient();
  return sharedClient;
}

export function HomeQueryClientProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() =>
    typeof window === "undefined" ? createHomeQueryClient() : getHomeQueryClient(),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export const useHomeQuery: typeof useQuery = ((options: Parameters<typeof useQuery>[0]) =>
  useQuery(options, browserHomeQueryClient())) as typeof useQuery;

export const useHomeInfiniteQuery: typeof useInfiniteQuery = ((options: Parameters<typeof useInfiniteQuery>[0]) =>
  useInfiniteQuery(options, browserHomeQueryClient())) as typeof useInfiniteQuery;

export { useQueryClient as useHomeQueryClient } from "@tanstack/react-query";
