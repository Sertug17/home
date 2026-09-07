import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { configuredGlobeCountries, locateCountries, projectCountry } from "./globe-geometry";
import { SupportedGlobe } from "./supported-globe";

describe("SupportedGlobe static-first contract", () => {
  test("server-renders a meaningful fallback without WebGL or client effects", () => {
    const markup = renderToStaticMarkup(<SupportedGlobe />);
    expect(markup).toContain('data-renderer="static"');
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="A world of country profiles"');
    expect(markup).toContain("country &amp; currency profiles. Product availability varies.");
    expect(markup).toContain("Points do not guarantee banking, funding, or product eligibility.");
    expect(markup).toContain("Static globe view.");
    expect(markup).not.toContain("<h1");
    expect(markup).not.toContain("Sign in");
  });

  test("keeps every configured marker and hemisphere culling without a redundant explorer or pause button", () => {
    const markup = renderToStaticMarkup(<SupportedGlobe />);
    for (const country of configuredGlobeCountries()) {
      expect(markup).toContain(`data-country="${country.countryCode}"`);
    }
    expect(markup).not.toContain("tabindex"); // Static fallback has no inert controls.
    expect(markup).not.toContain("<select");
    expect(markup).not.toContain("<button");
    const hidden = locateCountries(configuredGlobeCountries()).filter((country) => !projectCountry(country.longitude, country.latitude).visible);
    expect(markup.match(/visibility="hidden"/g) ?? []).toHaveLength(hidden.length);
  });

  test("accepts explicit profiles without changing the configured default or inventing country locations", () => {
    const markup = renderToStaticMarkup(<SupportedGlobe countries={[
      { countryCode: "MT", countryName: "Malta", currency: { code: "EUR", name: "Euro" } },
      { countryCode: "NZ", countryName: "New Zealand", currency: { code: "NZD", name: "New Zealand dollar" } },
    ]} />);
    expect(markup).toContain("2 country &amp; currency profiles");
    expect(markup).toContain('data-country="MT"');
    expect(markup).toContain('data-country="NZ"');
    expect(markup).not.toContain('data-country="US"');
    expect(renderToStaticMarkup(<SupportedGlobe countries={[]} />)).toContain("0 country &amp; currency profiles");
  });
});
