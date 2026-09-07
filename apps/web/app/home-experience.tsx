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
import {
  navigationItems,
  type NavigationId,
} from "@/config/navigation";
import {
  presentationRegions,
  regionIds,
  resolvePresentation,
  type PresentationRegion,
  type RegionId,
  type ResolutionSource,
} from "@/config/regions";
import { brand } from "@/config/brand";

type HomeExperienceProps = {
  detectedCountry?: string | null;
};

type RegionStyle = CSSProperties & {
  "--region-accent": string;
  "--region-accent-soft": string;
  "--region-surface": string;
};

const sourceLabels: Record<ResolutionSource, string> = {
  explicit: "Selected by you",
  persisted: "Remembered on this device",
  detected: "Suggested from approximate country",
  fallback: "Neutral preview",
};

export function HomeExperience({
  detectedCountry = null,
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
        <div className="connection-pill" aria-label="Account status: preview, not connected">
          <span aria-hidden="true" />
          preview · not connected
        </div>
      </header>

      <main className="app-main">
        <section className="welcome-grid" aria-labelledby="welcome-title">
          <div className="welcome-copy">
            <p className="eyebrow">{region.welcome.eyebrow}</p>
            <h1 id="welcome-title">{region.welcome.title}</h1>
            <p className="welcome-body">{region.welcome.body}</p>

            <div className="preference-card">
              <div className="field-row">
                <label htmlFor="country">Country</label>
                <span>{sourceLabels[resolutionSource]}</span>
              </div>
              <div className="select-wrap">
                <select
                  id="country"
                  value={regionId}
                  onChange={(event) =>
                    selectRegion(event.target.value as RegionId)
                  }
                  aria-describedby="country-help preference-status"
                >
                  {regionIds.map((id) => (
                    <option key={id} value={id}>
                      {presentationRegions[id].selectorLabel}
                    </option>
                  ))}
                </select>
                <ChevronIcon />
              </div>
              <div className="language-row">
                <span>Language</span>
                <strong>English</strong>
              </div>
              <p id="country-help" className="field-help">
                Country changes presentation only, not product eligibility.
                Language is a separate setting; this preview is English-only.
              </p>
              <p
                id="preference-status"
                className="sr-status"
                aria-live="polite"
              >
                {preferenceMessage ||
                  (isPreferenceReady ? "Country preference ready." : "Checking saved country preference.")}
              </p>
            </div>
          </div>

          <WelcomeArtwork region={region} />
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
          {activeNavigation === "save" ? <SavePanel /> : null}
          {activeNavigation === "invest" ? <InvestPanel /> : null}
        </section>
      </main>

      <footer className="app-footer">
        <p>Open-source preview on Base.</p>
        <p>No wallet, live balance, or financial route is connected.</p>
      </footer>
    </div>
  );
}

function WelcomeArtwork({ region }: { region: PresentationRegion }) {
  return (
    <div className="welcome-art" aria-label={`${region.countryName} presentation preview`}>
      <div className="orbit orbit-one" aria-hidden="true" />
      <div className="orbit orbit-two" aria-hidden="true" />
      <div className="art-card">
        <div className="art-card-top">
          <span>{region.countryName}</span>
          <span>{region.currency.code ?? "OPEN"}</span>
        </div>
        <div className="currency-mark" aria-hidden="true">
          {region.currency.symbol ?? "○"}
        </div>
        <div>
          <p>{region.currency.name}</p>
          <span>presentation preview</span>
        </div>
      </div>
      <div className="base-dot" aria-label="Built on Base">B</div>
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
  return (
    <div className="home-panel panel-grid">
      <section className="balance-card" aria-labelledby="money-heading">
        <div className="card-heading-row">
          <div>
            <p className="section-kicker">Preview account</p>
            <h2 id="money-heading">{capitalize(region.currency.name)}</h2>
          </div>
          <span className="status-badge">unconnected</span>
        </div>

        <div className="empty-balance" aria-label="No live balance available">
          <span>{region.currency.symbol ?? ""}</span>
          <strong>—</strong>
        </div>
        <p className="balance-note">
          No actual balance is available. Connect an authenticated wallet in a
          later slice to show owned assets here.
        </p>

        {region.candidateAsset ? (
          <div className="asset-candidate">
            <div>
              <span>Secondary candidate</span>
              <strong>{region.candidateAsset.symbol}</strong>
            </div>
            <p>{region.candidateAsset.note}</p>
          </div>
        ) : (
          <div className="asset-candidate asset-candidate-neutral">
            <div>
              <span>Underlying asset</span>
              <strong>Not selected</strong>
            </div>
            <p>Choose a supported preview country to see candidate details.</p>
          </div>
        )}

        <div className="action-row" aria-label="Money actions unavailable in preview">
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
          <ClockIcon />
        </div>
        <div className="empty-state">
          <div className="empty-state-icon"><SparkIcon /></div>
          <h3>No activity yet</h3>
          <p>
            Signed account activity will appear here after authentication and
            a real operation are connected.
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
      title="A steadier place for dollars."
      description="Saving is not connected in this preview. A later verified integration can show a real USDC position, sourced variable yield, and deposit or withdrawal review."
      points={[
        "No APY is displayed without a live, timestamped source.",
        "No deposit or withdrawal can be prepared or signed.",
        "USD exposure will be explained before any future conversion.",
      ]}
    />
  );
}

function InvestPanel() {
  return (
    <UnavailablePanel
      kicker="Invest"
      title="Investing, when the route is real."
      description="Assets and trading are intentionally unavailable. Eligibility, exact Base contracts, quotes, and execution must be verified before anything appears as actionable."
      points={[
        "No tokenized stock list is presented as currently available.",
        "No fixture prices, positions, or portfolio value are shown.",
        "Future actions will require explicit review and wallet signing.",
      ]}
    />
  );
}

function UnavailablePanel({
  kicker,
  title,
  description,
  points,
}: {
  kicker: string;
  title: string;
  description: string;
  points: string[];
}) {
  return (
    <section className="unavailable-panel">
      <div className="unavailable-copy">
        <p className="section-kicker">{kicker} · unavailable</p>
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button" disabled>
          Not available in preview
        </button>
      </div>
      <div className="guardrail-card">
        <p className="section-kicker">Before this goes live</p>
        <ul>
          {points.map((point) => (
            <li key={point}>
              <CheckIcon />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function UnavailableAction({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button type="button" disabled title={`${label} is unavailable in preview`}>
      <span>{icon}</span>
      {label}
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

function ChevronIcon() {
  return <svg {...iconProps}><path d="m8 10 4 4 4-4" /></svg>;
}
function HomeIcon() {
  return <svg {...iconProps}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
}
function SaveIcon() {
  return <svg {...iconProps}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M8 8a4 4 0 0 1 8 0" /></svg>;
}
function InvestIcon() {
  return <svg {...iconProps}><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19V3" /></svg>;
}
function PlusIcon() {
  return <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>;
}
function ArrowUpIcon() {
  return <svg {...iconProps}><path d="m7 10 5-5 5 5M12 5v14" /></svg>;
}
function ArrowDownIcon() {
  return <svg {...iconProps}><path d="m7 14 5 5 5-5M12 19V5" /></svg>;
}
function ClockIcon() {
  return <svg {...iconProps}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}
function SparkIcon() {
  return <svg {...iconProps}><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" /></svg>;
}
function CheckIcon() {
  return <svg {...iconProps}><path d="m5 12 4 4L19 6" /></svg>;
}
