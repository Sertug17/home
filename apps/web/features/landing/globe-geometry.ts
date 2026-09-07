import coordinates from "./globe-country-coordinates.json";
import { presentationRegions, regionIds } from "@/config/regions";

export type GlobeCountry = {
  countryCode: string;
  countryName: string;
  currency: { code: string | null; name: string };
};

export type GlobePoint = GlobeCountry & {
  longitude: number;
  latitude: number;
};

export const INITIAL_LONGITUDE = -28;
export const VIEW_LATITUDE = 12;
export const GLOBE_RADIUS = 44;
const RAD = Math.PI / 180;

/** Presentation profiles, deliberately not a claim about product eligibility. */
export function configuredGlobeCountries(): GlobeCountry[] {
  return regionIds.flatMap((id) => {
    const region = presentationRegions[id];
    return region.countryCode ? [region as GlobeCountry] : [];
  });
}

export function locateCountries(countries: readonly GlobeCountry[]): GlobePoint[] {
  const seen = new Set<string>();
  return countries.flatMap((country) => {
    const code = country.countryCode.trim().toUpperCase();
    const position = (coordinates as Record<string, number[]>)[code];
    if (!position || seen.has(code)) return [];
    seen.add(code);
    return [{ ...country, countryCode: code, longitude: position[0], latitude: position[1] }];
  });
}

/** Right-handed unit sphere: +Y north, +Z at the prime meridian. */
export function geographicVector(longitude: number, latitude: number) {
  const lon = longitude * RAD;
  const lat = latitude * RAD;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)] as const;
}

/** Orthographic projection shared by the GPU, hit testing, and static markers. */
export function projectCountry(longitude: number, latitude: number, viewLongitude = INITIAL_LONGITUDE) {
  const [x, y, z] = geographicVector(longitude - viewLongitude, latitude);
  const tilt = VIEW_LATITUDE * RAD;
  const screenY = y * Math.cos(tilt) - z * Math.sin(tilt);
  const depth = y * Math.sin(tilt) + z * Math.cos(tilt);
  return {
    x: 50 + GLOBE_RADIUS * x,
    y: 50 - GLOBE_RADIUS * screenY,
    depth,
    // Cull just before the limb; the shared circular clip contains each dot.
    visible: depth > 0.045,
  };
}

export function countryLabel(country: GlobeCountry) {
  return `${country.countryName} · ${country.currency.code ?? country.currency.name}`;
}

export function shouldAnimateGlobe(reducedMotion: boolean, userPlaying: boolean | null) {
  return userPlaying ?? !reducedMotion;
}

export function nearestCountry(
  points: readonly GlobePoint[],
  x: number,
  y: number,
  longitude: number,
  radius: number,
): GlobePoint | undefined {
  let nearest: GlobePoint | undefined;
  let distance = radius * radius;
  for (const point of points) {
    const projected = projectCountry(point.longitude, point.latitude, longitude);
    if (!projected.visible) continue;
    const nextDistance = (x - projected.x) ** 2 + (y - projected.y) ** 2;
    if (nextDistance < distance) {
      nearest = point;
      distance = nextDistance;
    }
  }
  return nearest;
}
