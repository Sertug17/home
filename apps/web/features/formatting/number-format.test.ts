import { describe, expect, test } from "bun:test";
import {
  formatPercentage,
  formatTokenAmount,
  formatUsdPrice,
} from "./number-format";

describe("financial number formatting", () => {
  test("formats ordinary USD prices with grouping and cents", () => {
    expect(formatUsdPrice("231.708792875")).toBe("$231.71");
    expect(formatUsdPrice("614.074104553")).toBe("$614.07");
    expect(formatUsdPrice("12345678901234567890.1")).toBe(
      "$12,345,678,901,234,567,890.10",
    );
    expect(formatUsdPrice(0)).toBe("$0.00");
    expect(formatUsdPrice("0")).toBe("$0.00");
    expect(formatUsdPrice("0e1")).toBe("$0.00");
    expect(formatUsdPrice("0.0e2")).toBe("$0.00");
    expect(formatUsdPrice("-0e1")).toBe("$0.00");
  });

  test("keeps useful precision for sub-cent USD prices without unbounded output", () => {
    expect(formatUsdPrice("0.000123456789")).toBe("$0.0001235");
    expect(formatUsdPrice("1e-7")).toBe("$0.0000001");
    expect(formatUsdPrice("0.000000001")).toBe("<$0.00000001");
  });

  test("rejects invalid and nonfinite USD inputs", () => {
    expect(formatUsdPrice("$1.25")).toBeNull();
    expect(formatUsdPrice("not-a-price")).toBeNull();
    expect(formatUsdPrice(Number.NaN)).toBeNull();
    expect(formatUsdPrice(Number.POSITIVE_INFINITY)).toBeNull();
  });

  test("bounds token decimals and marks nonzero values below the display precision", () => {
    expect(formatTokenAmount("1234567890123456789012345", 6)).toBe(
      "1,234,567,890,123,456,789.012345",
    );
    expect(formatTokenAmount("1234500", 6)).toBe("1.2345");
    expect(formatTokenAmount("1234567", 0)).toBe("1,234,567");
    expect(formatTokenAmount("1", 18)).toBe("<0.000001");
    expect(formatTokenAmount("0", 18)).toBe("0");
  });

  test("rejects malformed token amounts and invalid display bounds", () => {
    expect(() => formatTokenAmount("01", 6)).toThrow(TypeError);
    expect(() => formatTokenAmount("1", 6, 7)).toThrow(TypeError);
  });

  test("formats percentages consistently and rejects nonfinite values", () => {
    expect(formatPercentage(0.045)).toBe("4.50%");
    expect(formatPercentage(0)).toBe("0%");
    expect(formatPercentage(null)).toBe("Unavailable");
    expect(formatPercentage(Number.NaN)).toBe("Unavailable");
    expect(formatPercentage(Number.NEGATIVE_INFINITY)).toBe("Unavailable");
  });
});
