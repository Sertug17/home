"use client";

import { useCallback, useMemo, useState } from "react";
import { MoneyDataRefreshProvider } from "@/client/money-actions";
import {
  presentPortfolioValuation,
  usePortfolioValuation,
} from "@/client/portfolio";
import { useAccountWallet } from "@/client/account/cdp-client";
import {
  browserHomeQueryClient,
  useHomeQueryClient,
} from "@/client/query/query-client";
import { resolvePresentation, type RegionId } from "@/config/regions";
import { HomeExperience } from "./home-shell-provider";
import type { HomeExperienceProps } from "./home-types";

export function PortfolioHomeExperience(
  props: Omit<HomeExperienceProps, "assetBalances" | "onTransferConfirmed">,
) {
  const account = useAccountWallet();
  const queryClient = useHomeQueryClient(browserHomeQueryClient());
  const [selectedRegion, setSelectedRegion] = useState<RegionId>(
    () => resolvePresentation({ detectedCountry: props.detectedCountry }).region.id,
  );
  const session = account.status === "verified" && account.session?.smartAccount
    ? {
        subject: account.session.user.subject,
        smartAccountAddress: account.session.smartAccount.address,
        chainId: account.session.smartAccount.chainId,
        accountProvider: account.session.accountProvider,
      }
    : null;
  const valuation = usePortfolioValuation(
    session,
    selectedRegion,
    account.fetchPortfolioValuation,
  );
  const presentedValuation = useMemo(() => {
    const presented = presentPortfolioValuation(valuation);
    return valuation.revalidating && presented.status === "ready"
      ? { ...presented, revalidating: true as const, statusLabel: "Updating…" }
      : presented;
  }, [valuation]);
  const refreshWalletData = useCallback(() => {
    void queryClient.invalidateQueries({
      predicate: (query) => [
        "valuation",
        "portfolio",
        "activity",
        "savings-positions",
        "borrow",
        "actions",
      ].includes(String(query.queryKey[1] ?? "")),
    });
  }, [queryClient]);

  return (
    <MoneyDataRefreshProvider onConfirmed={refreshWalletData}>
      <HomeExperience
        {...props}
        assetBalances={presentedValuation}
        selectedRegionId={selectedRegion}
        onRegionChange={setSelectedRegion}
        onTransferConfirmed={refreshWalletData}
      />
    </MoneyDataRefreshProvider>
  );
}
