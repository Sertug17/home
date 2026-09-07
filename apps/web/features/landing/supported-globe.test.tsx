import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { configuredGlobeCountries, locateCountries, projectCountry } from "./globe-geometry";
import { SupportedGlobe } from "./supported-globe";

describe("SupportedGlobe static-first contract", () => {
  test("server-renders a complete fallback without WebGL or client effects", () => {
    const markup = renderToStaticMarkup(<SupportedGlobe />);
    expect(markup).toContain('data-renderer="static"');
    expect(markup).toContain("Country &amp; currency profiles. Product availability varies.");
    expect(markup).toContain("Points do not guarantee banking, funding, or product eligibility.");
    expect(markup).toContain('aria-label="Play globe rotation"');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain("<h1");
    expect(markup).not.toContain("Sign in");
  });

  test("every supported profile is accessible in one native selector, not a tab stop per dot", () => {
    const markup = renderToStaticMarkup(<SupportedGlobe />);
    for (const country of configuredGlobeCountries()) {
      expect(markup).toContain(`data-country="${country.countryCode}"`);
      expect(markup).toContain(`value="${country.countryCode}"`);
      expect(markup).toContain(country.currency.code!);
    }
    expect(markup).not.toContain("tabindex");
    expect(markup.match(/<select/g)).toHaveLength(1);
    expect(markup.match(/<button/g)).toHaveLength(1);
    const hidden = locateCountries(configuredGlobeCountries()).filter((country) => !projectCountry(country.longitude, country.latitude).visible);
    expect(markup.match(/visibility="hidden"/g) ?? []).toHaveLength(hidden.length);
  });

  test("accepts explicit profiles without changing the configured default or inventing country locations", () => {
    const markup = renderToStaticMarkup(<SupportedGlobe countries={[
      { countryCode: "MT", countryName: "Malta", currency: { code: "EUR", name: "Euro" } },
      { countryCode: "NZ", countryName: "New Zealand", currency: { code: "NZD", name: "New Zealand dollar" } },
    ]} />);
    expect(markup).toContain("2 country profiles");
    expect(markup).toContain('data-country="MT"');
    expect(markup).toContain('data-country="NZ"');
    expect(markup).not.toContain('data-country="US"');
    expect(renderToStaticMarkup(<SupportedGlobe countries={[]} />)).toContain("0 country profiles");
  });
});
