import type { Metadata } from "next";
import { PricedInvestExperience } from "@/features/invest/priced-invest-experience";
import { AuthenticatedSavingsExperience } from "@/features/savings/savings-experience";
import { PortfolioHomeExperience } from "../home-experience";

export const metadata: Metadata = {
  title: "Dashboard · Home",
  description: "Your verified Home account dashboard.",
};

export default function DashboardPage() {
  return (
    <PortfolioHomeExperience
      detectedCountry={null}
      investContent={<PricedInvestExperience />}
      savingsContent={<AuthenticatedSavingsExperience />}
      routeMode="dashboard"
    />
  );
}
