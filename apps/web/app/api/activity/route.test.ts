import { afterEach, describe, expect, test } from "bun:test";
import { setObservabilityLogWriterForTests } from "@/server/observability/log";
import { GET, createRecordedOperationsReader } from "./route";

afterEach(() => setObservabilityLogWriterForTests());

describe("GET /api/activity route composition", () => {
  test("logs rejected unauthenticated reads before activity sources", async () => {
    const lines: string[] = [];
    setObservabilityLogWriterForTests((line) => lines.push(line));

    const response = await GET(new Request(
      "http://127.0.0.1:3115/api/activity?to=2026-09-07T12%3A00%3A00.000Z",
    ));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({
        kind: "activity-read",
        outcome: "rejected",
        reason: "authorization",
        source: "none",
      }),
    ]);
  });

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
