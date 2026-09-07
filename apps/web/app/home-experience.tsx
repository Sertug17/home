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
  explicit: "Your choice",
  persisted: "Saved on this device",
  detected: "Suggested from country",
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
        <section className="welcome-section" aria-labelledby="welcome-title">
          <div className="welcome-copy">
            <p className="eyebrow">{region.welcome.eyebrow}</p>
            <h1 id="welcome-title">{region.welcome.title}</h1>
            <p className="welcome-body">{region.welcome.body}</p>
          </div>

          <div className="locale-control">
            <div className="field-row">
              <label htmlFor="country">Country</label>
              <span className="region-source">
                <span className="region-indicator" aria-hidden="true" />
                {sourceLabels[resolutionSource]}
              </span>
            </div>
            <CountrySelect
              value={regionId}
              onValueChange={selectRegion}
              describedBy="country-help preference-status"
            />
            <div className="language-row">
              <span>Language</span>
              <strong>English</strong>
            </div>
            <p id="country-help" className="field-help">
              Sets currency display only, not eligibility.
            </p>
            <p id="preference-status" className="sr-status" aria-live="polite">
              {preferenceMessage ||
                (isPreferenceReady
                  ? "Country preference ready."
                  : "Checking saved country preference.")}
            </p>
          </div>
        </section>

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
            />
          ) : null}
          {activeNavigation === "save"
            ? (savingsContent ?? <SavePanel />)
            : null}
          {activeNavigation === "invest"
            ? (investContent ?? <InvestPanel />)
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
}: {
  region: PresentationRegion;
  accountAddress: string | null;
  accountStatus: ReturnType<typeof useAccountWallet>["status"];
  onSignIn: () => void;
}) {
  const currencyCode = region.currency.code ?? "Local currency";
  const isChecking = accountStatus === "restoring" || accountStatus === "validating";
  const isVerified = accountStatus === "verified";

  return (
    <div className="home-panel panel-grid">
      <section className="account-card" aria-labelledby="money-heading">
        <div className="card-heading-row">
          <div>
            <p className="section-kicker">Your money</p>
            <h2 id="money-heading">{capitalize(region.currency.name)}</h2>
          </div>
          <span className="connection-status">
            <span aria-hidden="true" />
            {accountAddress
              ? "Verified on Base"
              : isChecking
                ? "Checking session"
                : isVerified
                  ? "Account pending"
                  : "Not connected"}
          </span>
        </div>

        <div
          className="empty-balance"
          role="group"
          aria-label={`No live ${region.currency.name} balance available`}
        >
          <span aria-hidden="true">{region.currency.symbol ?? ""}</span>
          <strong aria-hidden="true">—</strong>
        </div>
        <p className="balance-note">
          {accountAddress
            ? "Balance is not available until Home connects a verified balance reader."
            : isChecking
              ? "Checking for a previously verified account on this device."
              : "Sign in to view your verified account address."}
        </p>
        {accountAddress ? (
          <div className="account-link" aria-label="Verified Base account address">
            <code>{accountAddress}</code>
          </div>
        ) : isChecking ? null : (
          <button className="account-link" type="button" onClick={onSignIn}>
            Sign in to your account
            <ArrowRightIcon />
          </button>
        )}

        <dl className="account-details">
          <div>
            <dt>Display currency</dt>
            <dd>{currencyCode}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>Base</dd>
          </div>
          <div>
            <dt>Wallet</dt>
            <dd>
              {accountAddress
                ? `${accountAddress.slice(0, 6)}…${accountAddress.slice(-4)}`
                : isChecking
                  ? "Checking"
                  : isVerified
                    ? "Preparing account"
                    : "Not connected"}
            </dd>
          </div>
        </dl>

        <div
          className="action-row"
          aria-label="Money actions unavailable while signed out"
        >
          <UnavailableAction icon={<PlusIcon />} label="Add money" />
          <UnavailableAction icon={<ArrowUpIcon />} label="Send" />
          <UnavailableAction icon={<ArrowDownIcon />} label="Receive" />
        </div>
      </section>

      <section className="activity-card" aria-labelledby="activity-heading">
        <div className="card-heading-row">
          <div>
            <p className="section-kicker">Recent</p>
            <h2 id="activity-heading">Activity</h2>
          </div>
          <span className="activity-state">Account activity</span>
        </div>
        <div className="empty-state">
          <p className="empty-state-title">Nothing here yet</p>
          <p>
            Your account activity will appear here after you sign in.
          </p>
        </div>
      </section>
    </div>
  );
}

function SavePanel() {
  return (
    <UnavailablePanel
      kicker="Save"
      title="A clear place to save."
      description="Coming soon. See the live rate, provider, and withdrawal terms before moving any money."
    />
  );
}

function InvestPanel() {
  return (
    <UnavailablePanel
      kicker="Invest"
      title="Invest with the details up front."
      description="Coming soon. Review eligible assets, current prices, fees, and the exact Base route before you decide."
    />
  );
}

function UnavailablePanel({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <section className="unavailable-panel">
      <div>
        <p className="section-kicker">{kicker}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <span className="coming-soon">Coming soon</span>
    </section>
  );
}

function UnavailableAction({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button type="button" disabled title={`${label} is unavailable while signed out`}>
      {icon}
      <span>{label}</span>
    </button>
  );
}


function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
