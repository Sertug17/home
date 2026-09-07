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
      accent: "#0000FF",
      accentSoft: "#EEF0F3",
      surface: "#FFFFFF",
    },
    welcome: {
      eyebrow: "Money on Base",
      title: "Your money, in one place.",
      body: "Choose how money looks, then sign in to see your account.",
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
      note: "Candidate asset · route unavailable",
    },
    theme: {
      accent: "#0000FF",
      accentSoft: "#EEF0F3",
      surface: "#FFFFFF",
    },
    welcome: {
      eyebrow: "United States · USD",
      title: "Your dollars, at home.",
      body: "See your actual balance and activity after you sign in.",
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
      note: "Candidate asset · route unavailable",
    },
    theme: {
      accent: "#009C3B",
      accentSoft: "#EEF0F3",
      surface: "#FFFFFF",
    },
    welcome: {
      eyebrow: "Brazil · BRL",
      title: "Your reais, at home.",
      body: "See your actual balance and activity after you sign in.",
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
      note: "Candidate asset · route unavailable",
    },
    theme: {
      accent: "#E70011",
      accentSoft: "#EEF0F3",
      surface: "#FFFFFF",
    },
    welcome: {
      eyebrow: "Indonesia · IDR",
      title: "Your rupiah, at home.",
      body: "See your actual balance and activity after you sign in.",
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
