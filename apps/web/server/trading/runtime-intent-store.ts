import type { TradeIntentStore } from "./types";

let injectedStore: TradeIntentStore | null = null;
let runtimeStore: Promise<TradeIntentStore> | null = null;

export function setTradeIntentStoreForTests(store: TradeIntentStore | null): void {
  injectedStore = store;
}

export async function getTradeIntentStore(): Promise<TradeIntentStore> {
  if (injectedStore) return injectedStore;
  runtimeStore ??= import("./sqlite-intent-store.node").then(
    ({ SqliteTradeIntentStore }) => new SqliteTradeIntentStore(),
  );
  return runtimeStore;
}
