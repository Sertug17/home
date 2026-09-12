import { afterEach, describe, expect, test } from "bun:test";
import { setObservabilityLogWriterForTests } from "@/server/observability/log";
import { createRecordedOperationsReader } from "./route";

afterEach(() => setObservabilityLogWriterForTests());

describe("GET /api/activity route composition", () => {
  test("uses the shared actions reader and honors a pre-aborted request", async () => {
    let listCalls = 0;
    const reader = createRecordedOperationsReader({
      list: async () => {
        listCalls += 1;
        return [];
      },
    });
    const controller = new AbortController();
    controller.abort(new DOMException("fixture abort", "AbortError"));

    await expect(reader({
      subject: "fixture-subject",
      address: "0x1111111111111111111111111111111111111111",
      chainId: 8453,
      accountProvider: "cdp-embedded",
    }, controller.signal)).rejects.toHaveProperty("name", "AbortError");
    expect(listCalls).toBe(0);
  });
});
