import { describe, expect, test } from "bun:test";
import { executeActionOnce } from "./cdp-money-action-execution";
import { TransferExecutionError } from "@/shared/transfers/types";

const id = "11111111-1111-4111-8111-111111111111";
const plan = { calls: [{ to: "0x1111111111111111111111111111111111111111" as const, data: "0x1234" as const, value: "0" }] };

describe("thin action dispatch", () => {
  test("does not confirm or call a provider when the prepared generation is stale", async () => {
    let serverPosts = 0;
    let providerCalls = 0;
    await expect(executeActionOnce({
      id,
      generation: 7,
      fence: { assertCurrent: () => { throw new TransferExecutionError("stale-session"); } },
      confirmedPlans: new Map(),
      providerDispatches: new Map(),
      confirm: async () => { serverPosts += 1; return plan; },
      dispatch: async () => { providerCalls += 1; return `0x${"ab".repeat(32)}`; },
      recordHandle: async () => { serverPosts += 1; },
    })).rejects.toMatchObject({ reason: "stale-session" });
    expect({ serverPosts, providerCalls }).toEqual({ serverPosts: 0, providerCalls: 0 });
  });

  test("reuses one idempotent CDP dispatch when handle recording resolves remotely then throws locally", async () => {
    let confirmPosts = 0;
    let dispatches = 0;
    let handlePosts = 0;
    let recordedHandle: string | null = null;
    const confirmedPlans = new Map();
    const providerDispatches = new Map<string, Promise<string>>();
    const execute = () => executeActionOnce({
      id,
      generation: 3,
      fence: { assertCurrent: (generation) => { if (generation !== 3) throw new Error("stale"); } },
      confirmedPlans,
      providerDispatches,
      confirm: async () => { confirmPosts += 1; return plan; },
      dispatch: async () => {
        dispatches += 1;
        const request = { path: `/smart-accounts/${plan.calls[0].to}/send`, headers: { "X-Idempotency-Key": id } };
        expect(request.path.endsWith("/send")).toBe(true);
        expect(request.headers["X-Idempotency-Key"]).toBe(id);
        return `0x${"ab".repeat(32)}`;
      },
      recordHandle: async (handle) => {
        handlePosts += 1;
        recordedHandle = handle;
        if (handlePosts === 1) throw new Error("response stream failed after commit");
      },
    });

    await expect(execute()).rejects.toThrow("response stream failed after commit");
    await expect(execute()).resolves.toBe(`0x${"ab".repeat(32)}`);
    expect({ confirmPosts, dispatches, handlePosts }).toEqual({
      confirmPosts: 1,
      dispatches: 1,
      handlePosts: 2,
    });
    expect(recordedHandle as string | null).toBe(`0x${"ab".repeat(32)}`);
  });
});
