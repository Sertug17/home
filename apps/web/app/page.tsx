import { SupportedGlobe } from "@/client/landing/supported-globe";
import { PortfolioHomeExperience } from "@/client/home/home-experience";

export default function HomePage() {
  // Server geo can later pass a detected country here. Anonymous persisted
  // preference and URL shell state are resolved inside the client boundary.
  return (
    <PortfolioHomeExperience
      detectedCountry={null}
      landingVisual={<SupportedGlobe />}
      routeMode="landing"
    />
  );
}
