import { describe, expect, test } from "bun:test";
import { formatFiatValue } from "./format";

describe("portfolio fiat formatting", () => {
  test("keeps positive values below display precision distinct from true zero", () => {
    expect(formatFiatValue({ atoms: "4", scale: 3 }, "USD")).toBe(
      "USD <0.01",
    );
    expect(formatFiatValue({ atoms: "1", scale: 19 }, "EUR")).toBe(
      "EUR <0.01",
    );
    expect(formatFiatValue({ atoms: "0", scale: 18 }, "USD")).toBe(
      "USD 0.00",
    );
  });
});
