"use client";

import type { ReactNode } from "react";
import { HomeMark } from "@/components/home-mark";
import { ProfileMark } from "@/components/profile-mark";
import { useAccountWallet } from "@/client/account/cdp-client";

export function ShellHeader({
  isAccountSettingsOpen,
  nestedChromeTitle,
  nestedChromeBackLabel,
  onNestedChromeBack,
  routeMode,
  activeNavigation,
  isVerified,
  account,
  onHome,
  onDashboard,
  onSignIn,
  onSignOut,
  onOpenSettings,
  onCloseSettings,
}: {
  isAccountSettingsOpen: boolean;
  nestedChromeTitle: string | null;
  nestedChromeBackLabel: string;
  onNestedChromeBack: () => void;
  routeMode: "landing" | "dashboard";
  activeNavigation: string;
  isVerified: boolean;
  account: ReturnType<typeof useAccountWallet>;
  onHome: () => void;
  onDashboard: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
}) {
  return (
    <header className="app-header">
      <div className="app-header-start">
        {isAccountSettingsOpen ? (
          <h1 className="app-header-lead-title">Account</h1>
        ) : nestedChromeTitle ? (
          <NestedHomeHeader
            title={nestedChromeTitle}
            backLabel={nestedChromeBackLabel}
            onBack={onNestedChromeBack}
          />
        ) : routeMode === "dashboard" && activeNavigation === "invest" ? (
          <h1 className="app-header-lead-title">Invest</h1>
        ) : (
          <HomeMark onClick={() => { if (isVerified) onHome(); }} />
        )}
      </div>
      <span className="app-header-title-slot" aria-hidden="true" />
      <div className="app-header-end">
        {isAccountSettingsOpen ? (
          <button className="header-done-link" type="button" onClick={onCloseSettings}>
            Done
          </button>
        ) : (
          <HeaderAccountAction
            status={account.status}
            isSignedIn={account.isSignedIn}
            routeMode={routeMode}
            ownerKey={account.ownerKey}
            address={account.session?.smartAccount?.address ?? null}
            onDashboard={onDashboard}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
            onOpenSettings={onOpenSettings}
          />
        )}
      </div>
    </header>
  );
}

function HeaderAccountAction({
  status,
  isSignedIn,
  routeMode,
  ownerKey,
  address,
  onDashboard,
  onSignIn,
  onSignOut,
  onOpenSettings,
}: {
  status: ReturnType<typeof useAccountWallet>["status"];
  isSignedIn: boolean;
  routeMode: "landing" | "dashboard";
  ownerKey: string | null;
  address: string | null;
  onDashboard: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
}) {
  if (status === "signout-error") {
    return <button className="header-account-link" type="button" onClick={onSignOut}>Retry sign out</button>;
  }
  if (routeMode === "dashboard") {
    const checking = status === "restoring" || status === "validating";
    const signedIn = status === "verified" || (status === "unavailable" && isSignedIn);
    if (checking || signedIn) {
      return (
        <ProfileMark
          status={checking ? "loading" : "ready"}
          ownerKey={ownerKey}
          address={address}
          disabled={checking}
          onClick={signedIn && !checking ? onOpenSettings : undefined}
        />
      );
    }
  }
  if (status === "restoring" || status === "validating") {
    return <button className="header-account-link header-account-quiet" type="button" disabled>Account</button>;
  }
  if (status === "verified" || (status === "unavailable" && isSignedIn)) {
    return <button className="header-account-link" type="button" onClick={onDashboard}>Dashboard</button>;
  }
  return <button className="header-account-link" type="button" onClick={onSignIn}>Sign in</button>;
}

function NestedHomeHeader({
  title,
  backLabel,
  onBack,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="header-leading">
      <button className="header-back-link" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span>
        <span className="sr-only">{backLabel}</span>
      </button>
      <h1 className="header-panel-title app-header-title">{title}</h1>
    </div>
  );
}

export function SignedOutLanding({
  isVerified,
  signOutError,
  landingVisual,
  showCreateAccount,
  onDashboard,
  onSignIn,
  onRetrySignOut,
}: {
  isVerified: boolean;
  signOutError: string | null;
  landingVisual?: ReactNode;
  showCreateAccount: boolean;
  onDashboard: () => void;
  onSignIn: () => void;
  onRetrySignOut: () => void;
}) {
  return (
    <main className={`landing-main${landingVisual ? " landing-main-with-visual" : ""}`}>
      {landingVisual ? <div className="landing-visual">{landingVisual}</div> : null}
      <section className="landing-hero" aria-labelledby="landing-title">
        <h1 id="landing-title">One home for your money.</h1>
        <p className="landing-copy">Invest in any asset, earn more on your savings, and grow your wealth.</p>
        <div className="landing-actions">
          {isVerified ? (
            <button className="landing-primary" type="button" onClick={onDashboard}>Open dashboard</button>
          ) : (
            <>
              <button className="landing-primary" type="button" onClick={onSignIn}>Sign in</button>
              {showCreateAccount ? (
                <button className="landing-secondary" type="button" onClick={onSignIn}>Create account</button>
              ) : null}
            </>
          )}
        </div>
        {signOutError ? (
          <div className="landing-status" role="alert">
            <p>{signOutError}</p>
            <button type="button" onClick={onRetrySignOut}>Retry sign out</button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
