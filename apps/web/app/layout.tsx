import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { CdpAccountProvider } from "@/features/account/cdp-client";
import { normalizeProjectId } from "@/features/account/session-client";
import "./globals.css";

export const metadata: Metadata = {
  title: `${brand.name} · local money preview`,
  description: brand.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <CdpAccountProvider
          projectId={normalizeProjectId(process.env.NEXT_PUBLIC_CDP_PROJECT_ID)}
        >
          {children}
        </CdpAccountProvider>
      </body>
    </html>
  );
}
