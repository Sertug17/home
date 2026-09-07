"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  readAnonymousCountryPreference,
  writeAnonymousCountryPreference,
} from "@/config/country-preference";
import { navigationItems, type NavigationId } from "@/config/navigation";
import {
  presentationRegions,
  resolvePresentation,
  type PresentationRegion,
  type RegionId,
  type ResolutionSource,
} from "@/config/regions";
import { brand } from "@/config/brand";
import { CountrySelect } from "@/components/country-select";

type HomeExperienceProps = {
  detectedCountry?: string | null;
  investContent?: ReactNode;
  savingsContent?: ReactNode;
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
}: HomeExperienceProps) {
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
        <a className="header-account-link" href="/account">
          Sign in
        </a>
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
          {activeNavigation === "home" ? <HomePanel region={region} /> : null}
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
    </div>
  );
}

function PrimaryNavigation({
  activeNavigation,
  onNavigate,
}: {
  activeNavigation: NavigationId;
  onNavigate: (id: NavigationId) => void;
}) {
  return (
    <nav className="primary-nav" aria-label="Main navigation">
      {navigationItems.map((item) => {
        const isActive = activeNavigation === item.id;
        return (
          <button
            key={item.id}
            id={`${item.id}-nav`}
            type="button"
            className={isActive ? "nav-item nav-item-active" : "nav-item"}
            onClick={() => onNavigate(item.id)}
            aria-current={isActive ? "page" : undefined}
            aria-controls="navigation-panel"
          >
            <NavigationIcon id={item.id} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function HomePanel({ region }: { region: PresentationRegion }) {
  const currencyCode = region.currency.code ?? "Local currency";

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
            Not connected
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
          Sign in to view your actual balance and account address.
        </p>
        <a className="account-link" href="/account">
          Sign in to your account
          <ArrowRightIcon />
        </a>

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
            <dd>Not connected</dd>
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

function NavigationIcon({ id }: { id: NavigationId }) {
  if (id === "save") return <SaveIcon />;
  if (id === "invest") return <InvestIcon />;
  return <HomeIcon />;
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

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}
function SaveIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M8 8a4 4 0 0 1 8 0" />
    </svg>
  );
}
function InvestIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 19V9" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M22 19V3" />
    </svg>
  );
}
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
