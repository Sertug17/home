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
import {
  formatBaseUnitAmount,
  usePortfolio,
  type PortfolioState,
  type VerifiedPortfolioSession,
} from "@/features/portfolio";

export type HomeAssetBalanceItem = {
  id: string;
  name: string;
  detail: string;
  displayBalance: string;
};

export type HomeAssetBalancesPresentation = {
  status: "loading" | "ready" | "unavailable";
  displayTotal: string | null;
  statusLabel?: string;
  items: readonly HomeAssetBalanceItem[];
};

export type HomeExperienceProps = {
  detectedCountry?: string | null;
  investContent?: ReactNode;
  savingsContent?: ReactNode;
  initialAccountOpen?: boolean;
  assetBalances?: HomeAssetBalancesPresentation;
  landingVisual?: ReactNode;
};

export function PortfolioHomeExperience(
  props: Omit<HomeExperienceProps, "assetBalances">,
) {
  const account = useAccountWallet();
  const session: VerifiedPortfolioSession | null =
    account.status === "verified" && account.session?.smartAccount
      ? {
          subject: account.session.user.subject,
          smartAccountAddress: account.session.smartAccount.address,
          chainId: account.session.smartAccount.chainId,
        }
      : null;
  const portfolio = usePortfolio(session, account.fetchPortfolio);

  return <HomeExperience {...props} assetBalances={presentPortfolio(portfolio)} />;
}

function presentPortfolio(
  portfolio: PortfolioState,
): HomeAssetBalancesPresentation {
  if (portfolio.status === "loading") {
    return {
      status: "loading",
      displayTotal: null,
      statusLabel: "Updating USD/USDC balance",
      items: [],
    };
  }

  if (portfolio.status !== "ready") {
    return {
      status: "unavailable",
      displayTotal: null,
      statusLabel: "USD/USDC balance unavailable",
      items: [],
    };
  }

  const usdc = portfolio.snapshot.assets.find((asset) => asset.id === "usdc");
  const eth = portfolio.snapshot.assets.find((asset) => asset.id === "eth");
  if (!usdc || !eth) {
    return {
      status: "unavailable",
      displayTotal: null,
      statusLabel: "USD/USDC balance unavailable",
      items: [],
    };
  }

  const usdcAmount = formatBaseUnitAmount(
    usdc.balanceBaseUnits,
    usdc.decimals,
  );
  const ethAmount = formatBaseUnitAmount(eth.balanceBaseUnits, eth.decimals);

  return {
    status: "ready",
    displayTotal: `${usdcAmount} USDC`,
    statusLabel: "USD/USDC balance · ETH shown separately",
    items: [
      {
        id: "usdc",
        name: "USD / USDC",
        detail: "USDC on Base",
        displayBalance: `${usdcAmount} USDC`,
      },
      {
        id: "eth",
        name: "Ethereum",
        detail: "Native ETH on Base",
        displayBalance: `${ethAmount} ETH`,
      },
    ],
  };
}

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
  assetBalances,
  landingVisual,
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
  const isChecking =
    account.status === "restoring" || account.status === "validating";
  const isVerified = account.status === "verified";
  const isUnavailable = account.status === "unavailable";
  const isSignedOut =
    account.status === "signed-out" || account.status === "signout-error";

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

  function openAccount() {
    setIsAccountOpen(true);
  }

  return (
    <div className="app-frame" style={regionStyle}>
      <header className="app-header">
        <button
          className="wordmark"
          type="button"
          onClick={() => {
            if (isVerified) navigateTo("home");
          }}
          aria-label={isVerified ? "Go to Home" : brand.name}
        >
          {brand.name}
        </button>

        <div className="header-country" title={sourceLabels[resolutionSource]}>
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

        <HeaderAccountAction
          status={account.status}
          isSignedIn={account.isSignedIn}
          onSignIn={openAccount}
          onSignOut={() => void account.signOut().catch(() => {})}
        />
      </header>

      {isVerified ? (
        <main className="app-main app-main-authenticated">
          <div className="main-heading">
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
                accountAddress={
                  account.session?.smartAccount?.address ?? null
                }
                assetBalances={assetBalances}
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
      ) : isChecking ? (
        <AccountLoadingShell />
      ) : isUnavailable ? (
        <AccountUnavailableShell
          message={account.message}
          onRetry={() => void account.retrySessionValidation()}
        />
      ) : isSignedOut ? (
        <SignedOutLanding
          signOutError={
            account.status === "signout-error" ? account.message : null
          }
          landingVisual={landingVisual}
          onSignIn={openAccount}
          onRetrySignOut={() => void account.signOut().catch(() => {})}
        />
      ) : null}

      <footer className="app-footer">
        <p>Open source on Base.</p>
      </footer>

      <AccountSignInSheet open={isAccountOpen} onClose={closeAccount} />
    </div>
  );
}

function HeaderAccountAction({
  status,
  isSignedIn,
  onSignIn,
  onSignOut,
}: {
  status: ReturnType<typeof useAccountWallet>["status"];
  isSignedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  if (status === "signout-error") {
    return (
      <button className="header-account-link" type="button" onClick={onSignOut}>
        Retry sign out
      </button>
    );
  }

  if (status === "restoring" || status === "validating") {
    return (
      <button className="header-account-link" type="button" disabled>
        Checking…
      </button>
    );
  }

  if (status === "verified" || (status === "unavailable" && isSignedIn)) {
    return (
      <button className="header-account-link" type="button" onClick={onSignOut}>
        Sign out
      </button>
    );
  }

  return (
    <button className="header-account-link" type="button" onClick={onSignIn}>
      Sign in
    </button>
  );
}

function SignedOutLanding({
  signOutError,
  landingVisual,
  onSignIn,
  onRetrySignOut,
}: {
  signOutError: string | null;
  landingVisual?: ReactNode;
  onSignIn: () => void;
  onRetrySignOut: () => void;
}) {
  return (
    <main className={`landing-main${landingVisual ? " landing-main-with-visual" : ""}`}>
      {landingVisual ? (
        <div className="landing-visual">
          {landingVisual}
        </div>
      ) : null}
      <section className="landing-hero" aria-labelledby="landing-title">
        <h1 id="landing-title">The home for your money.</h1>
        <p className="landing-copy">
          Earn more, buy assets, and grow your wealth.
        </p>
        <div className="landing-actions">
          <button className="landing-primary" type="button" onClick={onSignIn}>
            Sign in
          </button>
          <button className="landing-secondary" type="button" onClick={onSignIn}>
            Create account
          </button>
        </div>
        {signOutError ? (
          <div className="landing-status" role="alert">
            <p>{signOutError}</p>
            <button type="button" onClick={onRetrySignOut}>
              Retry sign out
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function AccountLoadingShell() {
  return (
    <main className="account-state-main" aria-busy="true" aria-live="polite">
      <section className="account-state-card">
        <h1>Checking your account…</h1>
        <div className="loading-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}

function AccountUnavailableShell({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <main className="account-state-main">
      <section className="account-state-card" aria-labelledby="account-error-title">
        <p className="eyebrow">Account check</p>
        <h1 id="account-error-title">We couldn’t load your account.</h1>
        <p>{message ?? "Your private details remain hidden."}</p>
        <button className="landing-primary" type="button" onClick={onRetry}>
          Retry account check
        </button>
      </section>
    </main>
  );
}

function HomePanel({
  region,
  accountAddress,
  assetBalances,
  onNavigate,
}: {
  region: PresentationRegion;
  accountAddress: string | null;
  assetBalances?: HomeAssetBalancesPresentation;
  onNavigate: (navigation: NavigationId) => void;
}) {
  const balanceStatus = assetBalances?.statusLabel ??
    (assetBalances?.status === "loading"
      ? "Updating balances"
      : assetBalances?.status === "ready"
        ? "Current balance"
        : "Balance unavailable");
  const suppliedAssets = assetBalances?.items ?? [];

  return (
    <div className="home-panel">
      <section className="balance-panel" aria-labelledby="balance-heading">
        <div className="balance-heading-row">
          <div>
            <p className="section-kicker">Portfolio</p>
            <h2 id="balance-heading">USDC balance</h2>
          </div>
          <span className="connection-status">
            <span aria-hidden="true" />
            {accountAddress ? "Verified" : "Account pending"}
          </span>
        </div>

        <div className="balance-value" aria-label={balanceStatus}>
          <strong>{assetBalances?.displayTotal ?? "—"}</strong>
          <span>{balanceStatus}</span>
        </div>

        <div className="action-row" aria-label="Money actions unavailable">
          <UnavailableAction icon={<PlusIcon />} label="Add money" />
          <UnavailableAction icon={<ArrowUpIcon />} label="Send" />
          <UnavailableAction icon={<ArrowDownIcon />} label="Receive" />
        </div>

        <dl className="account-details">
          <div>
            <dt>Base account</dt>
            <dd>
              {accountAddress ? (
                <code title={accountAddress}>
                  {accountAddress.slice(0, 6)}…{accountAddress.slice(-4)}
                </code>
              ) : (
                "Setup in progress"
              )}
            </dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{region.countryName}</dd>
          </div>
        </dl>
      </section>

      <section className="assets-panel" aria-labelledby="assets-heading">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Overview</p>
            <h2 id="assets-heading">Assets</h2>
          </div>
          <span>{suppliedAssets.length > 0 ? "Token amounts" : "Balances not connected"}</span>
        </div>

        {suppliedAssets.length > 0 ? (
          <ul className="supplied-asset-list">
            {suppliedAssets.map((asset) => (
              <li key={asset.id}>
                <span className="asset-mark" aria-hidden="true">
                  {asset.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="asset-overview-name">
                  <strong>{asset.name}</strong>
                  <small>{asset.detail}</small>
                </span>
                <strong className="supplied-asset-balance">{asset.displayBalance}</strong>
              </li>
            ))}
          </ul>
        ) : (
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
        )}
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
