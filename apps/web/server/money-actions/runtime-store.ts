import type { MoneyActionStore } from "./store";

let injectedStore: MoneyActionStore | null = null;
let runtimeStore: Promise<MoneyActionStore> | null = null;

export function setMoneyActionStoreForTests(store: MoneyActionStore | null): void {
  injectedStore = store;
}

export async function getMoneyActionStore(): Promise<MoneyActionStore> {
  if (injectedStore) return injectedStore;
  runtimeStore ??= import("./sqlite-store.node").then(
    ({ SqliteMoneyActionStore }) => new SqliteMoneyActionStore(),
  );
  return runtimeStore;
}
