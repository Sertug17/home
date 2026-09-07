import { PricedInvestExperience } from "@/features/invest/priced-invest-experience";
import { SupportedGlobe } from "@/features/landing/supported-globe";
import { SavingsExperience } from "@/features/savings/savings-experience";
import { PortfolioHomeExperience } from "./home-experience";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const query = await searchParams;
  // Server geo can later pass a detected country here. Anonymous persisted
  // preference is intentionally resolved inside the client boundary.
  return (
    <PortfolioHomeExperience
      detectedCountry={null}
      investContent={<PricedInvestExperience />}
      savingsContent={<SavingsExperience />}
      initialAccountOpen={query.account === "signin"}
      landingVisual={<SupportedGlobe />}
    />
  );
}
