import type { Metadata } from "next";
import { AccountRoute } from "@/features/account/account-screen";
import { normalizeProjectId } from "@/features/account/session-client";

export const metadata: Metadata = {
  title: "Account · Home",
  description: "Sign in and receive money with your Base smart account.",
};

export default function AccountPage() {
  const projectId = normalizeProjectId(
    process.env.NEXT_PUBLIC_CDP_PROJECT_ID,
  );

  return <AccountRoute projectId={projectId} />;
}
