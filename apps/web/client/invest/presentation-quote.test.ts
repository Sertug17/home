import { describe, expect, test } from "bun:test";
import { presentationQuoteForRegion } from "./presentation-quote";

describe("presentationQuoteForRegion", () => {
  test("keeps USD identity for US and GLOBAL", () => {
    expect(presentationQuoteForRegion("US", [])).toEqual({
      regionId: "US",
      valueCurrency: "USD",
      quoteUnitsPerUsd: { atoms: "1", scale: 0 },
    });
    expect(presentationQuoteForRegion("GLOBAL", null)).toEqual({
      regionId: "GLOBAL",
      valueCurrency: "USD",
      quoteUnitsPerUsd: { atoms: "1", scale: 0 },
    });
  });

  test("selects a fresh IDR FX quote and fail-closes when it is missing", () => {
    expect(
      presentationQuoteForRegion("ID", [
        {
          quoteCurrency: "IDR",
          quoteUnitsPerUsd: { atoms: "16425", scale: 0 },
          status: "fresh",
        },
      ]),
    ).toEqual({
      regionId: "ID",
      valueCurrency: "IDR",
      quoteUnitsPerUsd: { atoms: "16425", scale: 0 },
    });
    expect(presentationQuoteForRegion("ID", [])).toEqual({
      regionId: "ID",
      valueCurrency: "IDR",
      quoteUnitsPerUsd: null,
    });
  });
});
