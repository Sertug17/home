import type { Metadata } from "next";
import { FundingExperience } from "@/features/funding/funding-experience";

export const metadata: Metadata = {
  title: "Add money · Home",
  description: "Fund your verified Home Base account.",
};

export default async function FundPage({
  searchParams,
}: PageProps<"/fund">) {
  const query = await searchParams;
  return <FundingExperience returnedFromCoinbase={query.return === "coinbase"} />;
}
