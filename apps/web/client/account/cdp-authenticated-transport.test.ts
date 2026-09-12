import { describe, expect, test } from "bun:test";
import { applyActionHandleEffects } from "./cdp-authenticated-transport";

const actionId = "11111111-1111-4111-8111-111111111111";
const path = `/api/actions/${actionId}/handle`;
const ownerKey = "subject\u00000x1111111111111111111111111111111111111111\u00008453\u0000cdp-embedded";

describe("authenticated action handle effects", () => {
  test("starts balance freshness when the provider handle is recorded", () => {
    const invalidations: unknown[][] = [];
    const freshness: string[] = [];

    applyActionHandleEffects({
      path,
      body: { providerHandle: `0x${"ab".repeat(32)}` },
      dataOwnerKey: ownerKey,
      queryClient: {
        invalidateQueries: async ({ queryKey }: { queryKey?: readonly unknown[] }) => {
          invalidations.push([...(queryKey ?? [])]);
        },
      } as never,
      startBalanceFreshness: (id) => { freshness.push(id); },
    });

    expect(freshness).toEqual([actionId]);
    expect(invalidations).toEqual([[ownerKey, "actions"]]);
  });

  test("transaction hash recording invalidates action, activity, savings, and borrow queries", () => {
    const invalidations: unknown[][] = [];
    const freshness: string[] = [];

    applyActionHandleEffects({
      path,
      body: { transactionHash: `0x${"cd".repeat(32)}` },
      dataOwnerKey: ownerKey,
      queryClient: {
        invalidateQueries: async ({ queryKey }: { queryKey?: readonly unknown[] }) => {
          invalidations.push([...(queryKey ?? [])]);
        },
      } as never,
      startBalanceFreshness: (id) => { freshness.push(id); },
    });

    expect(invalidations).toEqual([
      [ownerKey, "actions"],
      [ownerKey, "activity"],
      [ownerKey, "savings-positions"],
      [ownerKey, "borrow"],
    ]);
    expect(freshness).toEqual([actionId]);
  });
});
