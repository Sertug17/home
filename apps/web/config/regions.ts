export const regionIds = ["GLOBAL", "US", "BR", "ID"] as const;

export type RegionId = (typeof regionIds)[number];
export type CountryCode = Exclude<RegionId, "GLOBAL">;

export type PresentationRegion = {
  id: RegionId;
  countryCode: CountryCode | null;
  countryName: string;
  selectorLabel: string;
  currency: {
    code: "USD" | "BRL" | "IDR" | null;
    name: string;
    symbol: string | null;
  };
  candidateAsset: {
    symbol: "USDC" | "BRZ" | "IDRX";
    note: string;
  } | null;
  theme: {
    accent: string;
    accentSoft: string;
    surface: string;
  };
  welcome: {
    eyebrow: string;
    title: string;
    body: string;
  };
};

export const presentationRegions = {
  GLOBAL: {
    id: "GLOBAL",
    countryCode: null,
    countryName: "Global",
    selectorLabel: "Global / choose later",
    currency: {
      code: null,
      name: "your local currency",
      symbol: null,
    },
    candidateAsset: null,
    theme: {
      accent: "#1d4ed8",
      accentSoft: "#dfe8ff",
      surface: "#eee9df",
    },
    welcome: {
      eyebrow: "A home for your money",
      title: "Start local. Stay open to more.",
      body: "Choose a country to preview familiar currency details. This setting changes presentation only.",
    },
  },
  US: {
    id: "US",
    countryCode: "US",
    countryName: "United States",
    selectorLabel: "United States",
    currency: {
      code: "USD",
      name: "US dollar",
      symbol: "$",
    },
    candidateAsset: {
      symbol: "USDC",
      note: "Base asset candidate · no live route",
    },
    theme: {
      accent: "#1746d1",
      accentSoft: "#dce6ff",
      surface: "#e8ecf5",
    },
    welcome: {
      eyebrow: "Your US dollar home",
      title: "Everyday dollars, with room to grow.",
      body: "A calm place for dollar balances, saving, and investing — once your account is connected.",
    },
  },
  BR: {
    id: "BR",
    countryCode: "BR",
    countryName: "Brazil",
    selectorLabel: "Brazil",
    currency: {
      code: "BRL",
      name: "Brazilian real",
      symbol: "R$",
    },
    candidateAsset: {
      symbol: "BRZ",
      note: "Base asset candidate · no live route",
    },
    theme: {
      accent: "#176b4d",
      accentSoft: "#d8efe1",
      surface: "#e7eddf",
    },
    welcome: {
      eyebrow: "Your Brazilian real home",
      title: "Reais up front. Global options nearby.",
      body: "See familiar real-denominated presentation without confusing it with an actual connected balance.",
    },
  },
  ID: {
    id: "ID",
    countryCode: "ID",
    countryName: "Indonesia",
    selectorLabel: "Indonesia",
    currency: {
      code: "IDR",
      name: "Indonesian rupiah",
      symbol: "Rp",
    },
    candidateAsset: {
      symbol: "IDRX",
      note: "Base asset candidate · no live route",
    },
    theme: {
      accent: "#a43a2f",
      accentSoft: "#f4ddd6",
      surface: "#eee5dc",
    },
    welcome: {
      eyebrow: "Your Indonesian rupiah home",
      title: "Rupiah first. More possibilities next.",
      body: "Preview a rupiah-led home while wallet, eligibility, and funding connections remain off.",
    },
  },
} as const satisfies Record<RegionId, PresentationRegion>;

export type ResolutionSource =
  | "explicit"
  | "persisted"
  | "detected"
  | "fallback";

export type ResolvePresentationInput = {
  explicitCountry?: string | null;
  persistedCountry?: string | null;
  detectedCountry?: string | null;
};

export type ResolvedPresentation = {
  region: PresentationRegion;
  source: ResolutionSource;
};

export function isRegionId(value: string | null | undefined): value is RegionId {
  return regionIds.includes(value as RegionId);
}

export function normalizeRegionId(
  value: string | null | undefined,
): RegionId | null {
  const normalized = value?.trim().toUpperCase();
  return isRegionId(normalized) ? normalized : null;
}

function normalizeDetectedCountry(
  value: string | null | undefined,
): CountryCode | null {
  const normalized = normalizeRegionId(value);
  return normalized && normalized !== "GLOBAL" ? normalized : null;
}

export function resolvePresentation({
  explicitCountry,
  persistedCountry,
  detectedCountry,
}: ResolvePresentationInput): ResolvedPresentation {
  const explicit = normalizeRegionId(explicitCountry);
  if (explicit) {
    return { region: presentationRegions[explicit], source: "explicit" };
  }

  const persisted = normalizeRegionId(persistedCountry);
  if (persisted) {
    return { region: presentationRegions[persisted], source: "persisted" };
  }

  const detected = normalizeDetectedCountry(detectedCountry);
  if (detected) {
    return { region: presentationRegions[detected], source: "detected" };
  }

  return { region: presentationRegions.GLOBAL, source: "fallback" };
}
