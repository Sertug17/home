"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  readAnonymousCountryPreference,
  writeAnonymousCountryPreference,
} from "@/config/country-preference";
import type { NavigationId } from "@/config/navigation";
import { PrimaryNavigation } from "@/components/primary-navigation";
import {
  presentationRegions,
  resolvePresentation,
  type PresentationRegion,
  type RegionId,
  type ResolutionSource,
} from "@/config/regions";
import { brand } from "@/config/brand";
import { CountrySelect } from "@/components/country-select";
import { AccountSignInSheet } from "@/features/account/account-screen";
import { useAccountWallet } from "@/features/account/cdp-client";

type HomeExperienceProps = {
  detectedCountry?: string | null;
  investContent?: ReactNode;
  savingsContent?: ReactNode;
  initialAccountOpen?: boolean;
};

type RegionStyle = CSSProperties & {
  "--region-accent": string;
  "--region-accent-soft": string;
  "--region-surface": string;
};

const sourceLabels: Record<ResolutionSource, string> = {
  explicit: "Your country choice",
  persisted: "Saved country choice",
  detected: "Suggested country",
  fallback: "No country selected",
};

export function HomeExperience({
  detectedCountry = null,
  investContent,
  savingsContent,
  initialAccountOpen = false,
}: HomeExperienceProps) {
  const router = useRouter();
  const account = useAccountWallet();
  const initial = resolvePresentation({ detectedCountry });
  const [regionId, setRegionId] = useState<RegionId>(initial.region.id);
  const [resolutionSource, setResolutionSource] =
    useState<ResolutionSource>(initial.source);
  const [activeNavigation, setActiveNavigation] =
    useState<NavigationId>("home");
  const [navigationRequest, setNavigationRequest] = useState(0);
  const panelStageRef = useRef<HTMLElement>(null);
  const [isPreferenceReady, setIsPreferenceReady] = useState(false);
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const [isAccountOpen, setIsAccountOpen] = useState(initialAccountOpen);

  const closeAccount = useCallback(() => {
    setIsAccountOpen(false);
    if (initialAccountOpen) {
      router.replace("/", { scroll: false });
    }
  }, [initialAccountOpen, router]);

  useEffect(() => {
    const persistedCountry = readAnonymousCountryPreference(
      () => window.localStorage,
    );
    const resolved = resolvePresentation({
      persistedCountry,
      detectedCountry,
    });
    const hydrationFrame = window.requestAnimationFrame(() => {
      setRegionId(resolved.region.id);
      setResolutionSource(resolved.source);
      setIsPreferenceReady(true);
    });

    return () => window.cancelAnimationFrame(hydrationFrame);
  }, [detectedCountry]);

  useEffect(() => {
    if (navigationRequest === 0) return;

    const panelStage = panelStageRef.current;
    if (!panelStage) return;

    panelStage.focus({ preventScroll: true });
    panelStage.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }, [activeNavigation, navigationRequest]);

  const region = presentationRegions[regionId];
  const regionStyle: RegionStyle = {
    "--region-accent": region.theme.accent,
    "--region-accent-soft": region.theme.accentSoft,
    "--region-surface": region.theme.surface,
  };

  function selectRegion(nextRegionId: RegionId) {
    setRegionId(nextRegionId);
    setResolutionSource("explicit");
    const didPersist = writeAnonymousCountryPreference(
      () => window.localStorage,
      nextRegionId,
    );
    setPreferenceMessage(
      didPersist
        ? "Country preference saved on this device."
        : "Country updated for this visit. Browser storage is unavailable.",
    );
  }

  function navigateTo(nextNavigation: NavigationId) {
    setActiveNavigation(nextNavigation);
    setNavigationRequest((request) => request + 1);
  }

  return (
    <div className="app-frame" style={regionStyle}>
      <header className="app-header">
        <button
          className="wordmark"
          type="button"
          onClick={() => navigateTo("home")}
          aria-label="Go to Home"
        >
          {brand.name}
        </button>

        <div
          className="header-country"
          title={sourceLabels[resolutionSource]}
        >
          <CountrySelect
            value={regionId}
            onValueChange={selectRegion}
            describedBy="preference-status"
          />
          <p id="preference-status" className="sr-status" aria-live="polite">
            {preferenceMessage ||
              (isPreferenceReady
                ? `${sourceLabels[resolutionSource]}.`
                : "Checking saved country preference.")}
          </p>
        </div>

        {account.session ? (
          <button
            className="header-account-link"
            type="button"
            onClick={() => void account.signOut().catch(() => {})}
          >
            Sign out
          </button>
        ) : account.status === "signout-error" ? (
          <button
            className="header-account-link"
            type="button"
            onClick={() => void account.signOut().catch(() => {})}
          >
            Retry sign out
          </button>
        ) : account.status === "restoring" || account.status === "validating" ? (
          <button className="header-account-link" type="button" disabled>
            Checking…
          </button>
        ) : (
          <button
            className="header-account-link"
            type="button"
            onClick={() => setIsAccountOpen(true)}
          >
            Sign in
          </button>
        )}
      </header>

      <main className="app-main">
        <div className="main-heading">
          <p className="eyebrow">On Base</p>
          <h1>Money and assets</h1>
        </div>

        <PrimaryNavigation
          activeNavigation={activeNavigation}
          onNavigate={navigateTo}
        />

        <section
          ref={panelStageRef}
          className="panel-stage"
          id="navigation-panel"
          tabIndex={-1}
          aria-labelledby={`${activeNavigation}-nav`}
        >
          {activeNavigation === "home" ? (
            <HomePanel
              region={region}
              accountAddress={account.session?.smartAccount?.address ?? null}
              accountStatus={account.status}
              onSignIn={() => setIsAccountOpen(true)}
              onNavigate={navigateTo}
            />
          ) : null}
          {activeNavigation === "save"
            ? (savingsContent ?? <EmptyPanel label="Savings" />)
            : null}
          {activeNavigation === "invest"
            ? (investContent ?? <EmptyPanel label="Investments" />)
            : null}
        </section>
      </main>

      <footer className="app-footer">
        <p>Open source on Base.</p>
        <p>Country changes display, not financial eligibility.</p>
      </footer>

      <AccountSignInSheet open={isAccountOpen} onClose={closeAccount} />
    </div>
  );
}

function HomePanel({
  region,
  accountAddress,
  accountStatus,
  onSignIn,
  onNavigate,
}: {
  region: PresentationRegion;
  accountAddress: string | null;
  accountStatus: ReturnType<typeof useAccountWallet>["status"];
  onSignIn: () => void;
  onNavigate: (navigation: NavigationId) => void;
}) {
  const currencyCode = region.currency.code ?? "Local currency";
  const isChecking = accountStatus === "restoring" || accountStatus === "validating";
  const isVerified = accountStatus === "verified";

  return (
    <div className="home-panel">
      <section className="balance-panel" aria-labelledby="balance-heading">
        <div className="balance-heading-row">
          <div>
            <p className="section-kicker">Available balance</p>
            <h2 id="balance-heading">{currencyCode}</h2>
          </div>
          <span className="connection-status">
            <span aria-hidden="true" />
            {accountAddress
              ? "Verified"
              : isChecking
                ? "Checking"
                : isVerified
                  ? "Account pending"
                  : "Signed out"}
          </span>
        </div>

        <div className="balance-value" aria-label="Balance unavailable">
          <strong aria-hidden="true">—</strong>
          <span>{accountAddress ? "Balance unavailable" : "Sign in to see balances"}</span>
        </div>

        <div className="action-row" aria-label="Money actions unavailable">
          <UnavailableAction icon={<PlusIcon />} label="Add money" />
          <UnavailableAction icon={<ArrowUpIcon />} label="Send" />
          <UnavailableAction icon={<ArrowDownIcon />} label="Receive" />
        </div>

        {accountAddress ? (
          <dl className="account-details">
            <div>
              <dt>Base account</dt>
              <dd>
                <code title={accountAddress}>
                  {accountAddress.slice(0, 6)}…{accountAddress.slice(-4)}
                </code>
              </dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>Base</dd>
            </div>
          </dl>
        ) : isChecking ? (
          <p className="account-message">Checking for a verified account.</p>
        ) : (
          <button className="account-link" type="button" onClick={onSignIn}>
            Sign in to see your account
            <ArrowRightIcon />
          </button>
        )}
      </section>

      <section className="assets-panel" aria-labelledby="assets-heading">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Overview</p>
            <h2 id="assets-heading">Assets</h2>
          </div>
          <span>Balances not connected</span>
        </div>

        <div className="asset-overview-list">
          <button type="button" onClick={() => onNavigate("save")}>
            <span className="asset-mark" aria-hidden="true">$</span>
            <span className="asset-overview-name">
              <strong>USDC savings</strong>
              <small>Compare variable rates</small>
            </span>
            <span className="asset-overview-value">
              <strong>—</strong>
              <small>Position unavailable</small>
            </span>
            <ArrowRightIcon />
          </button>
          <button type="button" onClick={() => onNavigate("invest")}>
            <span className="asset-mark asset-mark-blue" aria-hidden="true">↗</span>
            <span className="asset-overview-name">
              <strong>Stocks and memes</strong>
              <small>Browse assets on Base</small>
            </span>
            <span className="asset-overview-value">
              <strong>—</strong>
              <small>Holdings unavailable</small>
            </span>
            <ArrowRightIcon />
          </button>
        </div>
      </section>

      <section className="activity-panel" aria-labelledby="activity-heading">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Recent</p>
            <h2 id="activity-heading">Activity</h2>
          </div>
        </div>
        <p className="empty-activity">No account activity available.</p>
      </section>
    </div>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <section className="empty-panel" aria-label={label}>
      <strong>{label} unavailable</strong>
    </section>
  );
}

function UnavailableAction({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button type="button" disabled title={`${label} is not available yet`}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function PlusIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function ArrowUpIcon() {
  return (
    <svg {...iconProps}>
      <path d="m7 10 5-5 5 5M12 5v14" />
    </svg>
  );
}
function ArrowDownIcon() {
  return (
    <svg {...iconProps}>
      <path d="m7 14 5 5 5-5M12 19V5" />
    </svg>
  );
}
function ArrowRightIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 12h14" />
      <path d="m14 7 5 5-5 5" />
    </svg>
  );
}
