import type { Metadata } from "next";
import { DashboardExperience } from "@/client/home/dashboard-experience";

export const metadata: Metadata = {
  title: "Dashboard · Home",
  description: "Your verified Home account dashboard.",
};

export default function DashboardPage() {
  return <DashboardExperience />;
}
