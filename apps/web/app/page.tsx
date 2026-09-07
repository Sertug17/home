import { InvestExperience } from "@/features/invest/invest-experience";
import { SavingsExperience } from "@/features/savings/savings-experience";
import { HomeExperience } from "./home-experience";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const query = await searchParams;
  // Server geo can later pass a detected country here. Anonymous persisted
  // preference is intentionally resolved inside the client boundary.
  return (
    <HomeExperience
      detectedCountry={null}
      investContent={<InvestExperience />}
      savingsContent={<SavingsExperience />}
      initialAccountOpen={query.account === "signin"}
    />
  );
}
