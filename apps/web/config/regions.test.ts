import { describe, expect, test } from "bun:test";
import { resolvePresentation } from "./regions";

describe("resolvePresentation", () => {
  test("resolves each supported detected country", () => {
    expect(resolvePresentation({ detectedCountry: "US" }).region.id).toBe("US");
    expect(resolvePresentation({ detectedCountry: "br" }).region.id).toBe("BR");
    expect(resolvePresentation({ detectedCountry: " ID " }).region.id).toBe("ID");
  });

  test("uses the neutral fallback for an unknown country", () => {
    const result = resolvePresentation({ detectedCountry: "DE" });

    expect(result.region.id).toBe("GLOBAL");
    expect(result.source).toBe("fallback");
  });

  test("uses the neutral fallback when country is missing", () => {
    expect(resolvePresentation({}).region.id).toBe("GLOBAL");
    expect(resolvePresentation({ detectedCountry: null }).source).toBe(
      "fallback",
    );
  });

  test("gives an explicit selection precedence over persisted and detected values", () => {
    const result = resolvePresentation({
      explicitCountry: "ID",
      persistedCountry: "BR",
      detectedCountry: "US",
    });

    expect(result.region.id).toBe("ID");
    expect(result.source).toBe("explicit");
  });

  test("gives a persisted anonymous selection precedence over detection", () => {
    const result = resolvePresentation({
      persistedCountry: "BR",
      detectedCountry: "US",
    });

    expect(result.region.id).toBe("BR");
    expect(result.source).toBe("persisted");
  });

  test("persists a deliberate neutral selection over later detection", () => {
    const result = resolvePresentation({
      persistedCountry: "GLOBAL",
      detectedCountry: "US",
    });

    expect(result.region.id).toBe("GLOBAL");
    expect(result.source).toBe("persisted");
  });

  test("ignores an invalid persisted value and continues to detection", () => {
    const result = resolvePresentation({
      persistedCountry: "ZZ",
      detectedCountry: "BR",
    });

    expect(result.region.id).toBe("BR");
    expect(result.source).toBe("detected");
  });
});
