import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Account · Home",
  description: "Sign in to Home.",
};

export default function AccountPage() {
  redirect("/?account=signin");
}
