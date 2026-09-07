import { describe, expect, test } from "bun:test";
import {
  CURRENCY_DEFAULTS_SOURCE,
  EURO_AREA_COUNTRIES_SOURCE,
  REGIONAL_MONEY_SOURCE,
  countryRegionIds,
  normalizeRegionId,
  presentationRegions,
  regionIds,
  resolvePresentation,
} from "./regions";

const expectedCountryCurrencies = {
  AR: "ARS",
  AU: "AUD",
  AT: "EUR",
  BE: "EUR",
  BR: "BRL",
  BG: "EUR",
  CA: "CAD",
  CL: "CLP",
  CO: "COP",
  HR: "EUR",
  CY: "EUR",
  EE: "EUR",
  FI: "EUR",
  FR: "EUR",
  DE: "EUR",
  GR: "EUR",
  ID: "IDR",
  IE: "EUR",
  IT: "EUR",
  LV: "EUR",
  LT: "EUR",
  LU: "EUR",
  MY: "MYR",
  MT: "EUR",
  MX: "MXN",
  NL: "EUR",
  NZ: "NZD",
  NG: "NGN",
  PE: "PEN",
  PT: "EUR",
  SG: "SGD",
  SK: "EUR",
  SI: "EUR",
  ZA: "ZAR",
  ES: "EUR",
  CH: "CHF",
  TR: "TRY",
  GB: "GBP",
  US: "USD",
} as const;

const expectedDefaultAssets = {
  ARS: ["wARS", "Ripio", "Additional verification"],
  AUD: ["AUDD", "AUDC", "Verification pending"],
  BRL: ["BRZ", "Transfero", "Verification pending"],
  CAD: ["CADD", "Moneda", "Additional verification"],
  CHF: ["VCHF", "VNX", "Additional verification"],
  CLP: ["wCLP", "Ripio", "Additional verification"],
  COP: ["wCOP", "Ripio", "Additional verification"],
  EUR: ["EURC", "Circle", "Verification pending"],
  GBP: ["tGBP", "BCP Technologies", "Verification pending"],
  IDR: ["IDRX", "IDRX", "Verification pending"],
  MXN: ["MXNB", "Juno / Bitso", "Verification pending"],
  MYR: ["MYRC", "BLOX", "Verification pending"],
  NGN: ["cNGN", "cNGN", "Verification pending"],
  NZD: ["NZDD", "NZDD", "Verification pending"],
  PEN: ["wPEN", "Ripio", "Additional verification"],
  SGD: ["XSGD", "StraitsX", "Verification pending"],
  TRY: ["TRYB", "BiLira", "Additional verification"],
  USD: ["USDC", "Circle", "Verification pending"],
  ZAR: ["ZARP", "ZARP", "Verification pending"],
} as const;

const euroAreaCodes = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PT",
  "SK",
  "SI",
  "ES",
] as const;

describe("presentation regions", () => {
  test("contains the complete reviewed presentation roster with unique ISO country IDs", () => {
    expect(regionIds).toHaveLength(40);
    expect(countryRegionIds).toHaveLength(39);
    expect(new Set(regionIds).size).toBe(regionIds.length);
    expect(new Set(countryRegionIds).size).toBe(countryRegionIds.length);
    expect(Object.keys(presentationRegions)).toEqual([...regionIds]);

    for (const [countryCode, currencyCode] of Object.entries(
      expectedCountryCurrencies,
    )) {
      const region = presentationRegions[countryCode as keyof typeof expectedCountryCurrencies];
      expect(region.countryCode as string).toBe(countryCode);
      expect(region.currency.code).toBe(currencyCode);
    }
  });

  test("keeps Global first and country options alphabetized by English country name", () => {
    expect(regionIds[0]).toBe("GLOBAL");
    const labels = countryRegionIds.map(
      (countryCode) => presentationRegions[countryCode].countryName,
    );
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "en")));
  });

  test("uses the authoritative 2026 euro-area roster, including Bulgaria", () => {
    const configuredEuroCountries = countryRegionIds.filter(
      (countryCode) => presentationRegions[countryCode].currency.code === "EUR",
    );

    expect(configuredEuroCountries).toEqual([...euroAreaCodes]);
    for (const countryCode of euroAreaCodes) {
      expect(
        presentationRegions[countryCode].sources.countryCurrencyMapping,
      ).toBe(EURO_AREA_COUNTRIES_SOURCE);
    }
    expect(normalizeRegionId("EU")).toBeNull();
    expect(normalizeRegionId("CZ")).toBeNull();
    expect(normalizeRegionId("DK")).toBeNull();
  });

  test("retains every confirmed product default as a disabled presentation candidate", () => {
    const byCurrency = new Map(
      countryRegionIds.map((countryCode) => {
        const region = presentationRegions[countryCode];
        return [region.currency.code, region] as const;
      }),
    );

    expect(byCurrency.size).toBe(19);
    for (const [currencyCode, [symbol, issuer, verificationStatus]] of Object.entries(
      expectedDefaultAssets,
    )) {
      const region = byCurrency.get(currencyCode as keyof typeof expectedDefaultAssets);
      expect(region).toBeDefined();
      expect(region?.candidateAsset).toMatchObject({
        symbol,
        issuer,
        selectionStatus: "confirmed-product-default",
        verificationStatus,
        fundingStatus: "disabled",
        source: CURRENCY_DEFAULTS_SOURCE,
      });
      expect(region?.sources.defaultAsset).toBe(CURRENCY_DEFAULTS_SOURCE);
      expect(region?.candidateAsset).not.toHaveProperty("enabled");
      expect(region?.candidateAsset).not.toHaveProperty("decimals");
      expect(region).not.toHaveProperty("eligible");
    }
  });

  test("preserves CADD, wARS, and an unresolved TRYB product-family choice", () => {
    expect(presentationRegions.CA.candidateAsset?.symbol).toBe("CADD");
    expect(presentationRegions.AR.candidateAsset?.symbol).toBe("wARS");
    expect(presentationRegions.TR.candidateAsset).toMatchObject({
      symbol: "TRYB",
      issuer: "BiLira",
      verificationStatus: "Additional verification",
      fundingStatus: "disabled",
    });
    expect(presentationRegions.TR.candidateAsset?.contractSelection).toContain(
      "no contract selected",
    );
    expect(presentationRegions.TR.candidateAsset).not.toHaveProperty("address");
  });

  test("excludes held countries while retaining neutral fallback", () => {
    for (const heldCountry of ["TZ", "UG", "TH"]) {
      expect(normalizeRegionId(heldCountry)).toBeNull();
      expect(resolvePresentation({ detectedCountry: heldCountry })).toEqual({
        region: presentationRegions.GLOBAL,
        source: "fallback",
      });
    }
  });

  test("maps non-euro countries through the reviewed regional-money source", () => {
    for (const countryCode of countryRegionIds) {
      const region = presentationRegions[countryCode];
      if (region.currency.code !== "EUR") {
        expect(region.sources.countryCurrencyMapping).toBe(
          REGIONAL_MONEY_SOURCE,
        );
      }
    }
  });
});

describe("resolvePresentation", () => {
  test("resolves original and representative expanded country codes", () => {
    expect(resolvePresentation({ detectedCountry: "US" }).region.id).toBe("US");
    expect(resolvePresentation({ detectedCountry: "br" }).region.id).toBe("BR");
    expect(resolvePresentation({ detectedCountry: " ID " }).region.id).toBe("ID");
    expect(resolvePresentation({ detectedCountry: "fr" }).region.id).toBe("FR");
    expect(resolvePresentation({ detectedCountry: "ca" }).region.id).toBe("CA");
    expect(resolvePresentation({ detectedCountry: "tr" }).region.id).toBe("TR");
    expect(resolvePresentation({ detectedCountry: "ng" }).region.id).toBe("NG");
  });

  test("uses the neutral fallback for an unknown country", () => {
    const result = resolvePresentation({ detectedCountry: "ZZ" });

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
      explicitCountry: "TR",
      persistedCountry: "FR",
      detectedCountry: "US",
    });

    expect(result.region.id).toBe("TR");
    expect(result.source).toBe("explicit");
  });

  test("gives a persisted anonymous selection precedence over detection", () => {
    const result = resolvePresentation({
      persistedCountry: "CA",
      detectedCountry: "US",
    });

    expect(result.region.id).toBe("CA");
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
