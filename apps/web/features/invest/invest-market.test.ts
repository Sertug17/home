import { describe, expect, test } from "bun:test";
import { getMarketDisplay, type MarketDataState } from "./invest-market";

describe("invest market display", () => {
  test("never coerces unavailable, loading, or failed prices to zero", () => {
    const states: MarketDataState[] = [
      { status: "unavailable" },
      { status: "loading" },
      { status: "error", message: "Source timed out" },
      { status: "ready", snapshots: [] },
    ];

    for (const state of states) {
      expect(getMarketDisplay("nvdac", state).value).toBe("—");
    }
  });

  test("renders only caller-supplied display values and provenance", () => {
    const state: MarketDataState = {
      status: "ready",
      snapshots: [
        {
          assetId: "degen",
          displayPrice: "Caller supplied",
          asOf: "2026-09-07T12:00:00Z",
          sourceLabel: "Fixture source",
          sourceUrl: "https://example.com/fixture",
        },
      ],
    };

    expect(getMarketDisplay("degen", state)).toEqual({
      value: "Caller supplied",
      detail: "Fixture source · 2026-09-07T12:00:00Z",
      sourceUrl: "https://example.com/fixture",
      tone: "ready",
    });
    expect(getMarketDisplay("toshi", state).detail).toBe("No price supplied");
  });

  test("uses a stable error fallback when no provider message is present", () => {
    expect(getMarketDisplay("aaplc", { status: "error" })).toEqual({
      value: "—",
      detail: "Pricing unavailable",
      tone: "error",
    });
  });
});
