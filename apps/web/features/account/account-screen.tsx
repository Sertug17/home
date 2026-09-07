"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { classifyEmailCodeError } from "./auth-errors";
import { CdpAccountProvider, useAccountWallet } from "./cdp-client";
import styles from "./account.module.css";
import {
  getVisibleVerifiedSession,
  SessionValidationError,
  validateAccountSession,
  type VerifiedSessionOwner,
} from "./session-client";
import {
  isSessionSuppressedForOwner,
  signOutWithSessionSuppressed,
} from "./session-sign-out";

const RESEND_COOLDOWN_SECONDS = 30;

type ValidationStatus =
  | "idle"
  | "validating"
  | "verified"
  | "not-ready"
  | "unavailable";

function AccountUnavailable() {
  return (
    <AccountShell>
      <section className={styles.card} aria-labelledby="account-unavailable-title">
        <p className={styles.kicker}>Account unavailable</p>
        <h1 id="account-unavailable-title">Sign-in needs a CDP project.</h1>
        <p className={styles.bodyCopy}>
          Add the public CDP project ID to this deployment before using email
          sign-in. No wallet provider was started.
        </p>
        <Link className={styles.secondaryLink} href="/">
          Return home
        </Link>
      </section>
    </AccountShell>
  );
}

function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <Link className={styles.wordmark} href="/" aria-label="Home">
            home
          </Link>
          <span className={styles.networkPill}>
            <span aria-hidden="true" /> Base
          </span>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </main>
  );
}

function messageForCodeError(error: unknown): string {
  switch (classifyEmailCodeError(error)) {
    case "invalid":
      return "That code is not valid. Check the six digits and try again.";
    case "expired":
      return "That code has expired. Request a new code to continue.";
    default:
      return "We could not verify that code. Please try again.";
  }
}

function AccountExperience() {
  const {
    isInitialized,
    isSignedIn,
    ownerKey,
    requestEmailCode,
    verifyEmailCode,
    getAccessToken,
    signOut,
  } = useAccountWallet();
  const [email, setEmail] = useState("");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [hasVerifiedCode, setHasVerifiedCode] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [verifiedOwner, setVerifiedOwner] =
    useState<VerifiedSessionOwner | null>(null);
  const [validationStatus, setValidationStatus] =
    useState<ValidationStatus>("idle");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [suppressedOwnerKey, setSuppressedOwnerKey] = useState<string | null>(
    null,
  );
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const validationRequest = useRef<AbortController | null>(null);
  const validationSequence = useRef(0);

  const isSessionSuppressed = isSessionSuppressedForOwner(
    suppressedOwnerKey,
    ownerKey,
  );
  const visibleSession = getVisibleVerifiedSession(
    verifiedOwner,
    ownerKey,
    isSigningOut || isSessionSuppressed,
  );

  useEffect(() => {
    if (resendAvailableAt === null) {
      return;
    }

    const timer = window.setInterval(() => {
      const seconds = Math.max(
        0,
        Math.ceil((resendAvailableAt - Date.now()) / 1000),
      );
      setResendSeconds(seconds);
      if (seconds === 0) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  const clearPrivateState = useCallback(() => {
    validationRequest.current?.abort();
    validationSequence.current += 1;
    setVerifiedOwner(null);
    setValidationStatus("idle");
    setValidationMessage(null);
    setCopyStatus("idle");
  }, []);

  const validateSession = useCallback(async () => {
    if (
      !isInitialized ||
      !isSignedIn ||
      !ownerKey ||
      isSigningOut ||
      isSessionSuppressed
    ) {
      return;
    }

    setSuppressedOwnerKey(null);
    validationRequest.current?.abort();
    const controller = new AbortController();
    validationRequest.current = controller;
    const sequence = ++validationSequence.current;

    setVerifiedOwner(null);
    setValidationStatus("validating");
    setValidationMessage(null);
    setCopyStatus("idle");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new SessionValidationError("unauthenticated");
      }

      const session = await validateAccountSession(accessToken, controller.signal);
      if (controller.signal.aborted || sequence !== validationSequence.current) {
        return;
      }

      setVerifiedOwner({ ownerKey, session });
      setValidationStatus(session.smartAccount ? "verified" : "not-ready");
    } catch (error) {
      if (controller.signal.aborted || sequence !== validationSequence.current) {
        return;
      }

      setVerifiedOwner(null);
      if (
        error instanceof SessionValidationError &&
        error.reason === "unauthenticated"
      ) {
        setAuthNotice("Your session could not be verified. Please sign in again.");
        setValidationStatus("idle");
        await signOutWithSessionSuppressed({
          ownerKey,
          signOut,
          suppress: setSuppressedOwnerKey,
          onFailure: () => {
            setValidationStatus("unavailable");
            setValidationMessage(
              "We could not clear the wallet session. Try signing out again.",
            );
          },
        });
        return;
      }

      setValidationStatus("unavailable");
      setValidationMessage(
        "Account verification is unavailable right now. Your wallet details remain hidden.",
      );
    }
  }, [
    getAccessToken,
    isInitialized,
    isSignedIn,
    isSessionSuppressed,
    isSigningOut,
    ownerKey,
    signOut,
  ]);

  useEffect(() => {
    if (
      !isInitialized ||
      !isSignedIn ||
      !ownerKey ||
      isSigningOut ||
      isSessionSuppressed
    ) {
      validationRequest.current?.abort();
      return;
    }

    const timer = window.setTimeout(() => void validateSession(), 0);
    return () => {
      window.clearTimeout(timer);
      validationRequest.current?.abort();
    };
  }, [
    isInitialized,
    isSessionSuppressed,
    isSignedIn,
    isSigningOut,
    ownerKey,
    validateSession,
  ]);

  async function sendCode(nextEmail: string) {
    setIsSendingCode(true);
    setAuthError(null);
    setAuthNotice(null);
    setHasVerifiedCode(false);
    setSuppressedOwnerKey(null);
    try {
      const result = await requestEmailCode(nextEmail);
      setFlowId(result.flowId);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setResendSeconds(RESEND_COOLDOWN_SECONDS);
    } catch {
      setAuthError("We could not send a code. Check the address and try again.");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthError("Enter an email address to continue.");
      return;
    }
    setEmail(normalizedEmail);
    await sendCode(normalizedEmail);
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!flowId || !/^\d{6}$/.test(otp)) {
      setAuthError("Enter the six-digit code from your email.");
      return;
    }

    setIsVerifyingCode(true);
    setAuthError(null);
    try {
      await verifyEmailCode(flowId, otp);
      setOtp("");
      setFlowId(null);
      setEmail("");
      setResendAvailableAt(null);
      setResendSeconds(0);
      setHasVerifiedCode(true);
    } catch (error) {
      setAuthError(messageForCodeError(error));
    } finally {
      setIsVerifyingCode(false);
    }
  }

  async function handleResend() {
    if (!email || resendSeconds > 0 || isSendingCode) {
      return;
    }
    setOtp("");
    await sendCode(email);
  }

  function handleChangeEmail() {
    setFlowId(null);
    setOtp("");
    setAuthError(null);
    setAuthNotice(null);
    setResendAvailableAt(null);
    setResendSeconds(0);
    setHasVerifiedCode(false);
  }

  async function handleSignOut() {
    if (!ownerKey) {
      return;
    }

    setIsSigningOut(true);
    setAuthError(null);
    setAuthNotice(null);
    setFlowId(null);
    setOtp("");
    setEmail("");
    setHasVerifiedCode(false);
    clearPrivateState();

    const signedOut = await signOutWithSessionSuppressed({
      ownerKey,
      signOut,
      suppress: setSuppressedOwnerKey,
      onFailure: () => {
        setValidationStatus("unavailable");
        setValidationMessage(
          "We could not clear the wallet session. Try signing out again.",
        );
        setAuthNotice("Sign-out did not finish. Please try again.");
      },
    });

    if (signedOut) {
      setAuthNotice("You are signed out.");
    }
    setIsSigningOut(false);
  }

  async function handleCopyAddress() {
    const address = visibleSession?.smartAccount?.address;
    if (!address) {
      return;
    }

    try {
      await navigator.clipboard.writeText(address);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  if (!isInitialized) {
    return (
      <AccountShell>
        <section className={styles.card} aria-live="polite">
          <p className={styles.kicker}>Secure account</p>
          <h1>Restoring your session…</h1>
          <p className={styles.bodyCopy}>
            Checking for an existing wallet session on this device.
          </p>
          <div className={styles.loadingBar} aria-hidden="true" />
        </section>
      </AccountShell>
    );
  }

  if (!isSignedIn) {
    return (
      <AccountShell>
        <section className={styles.card} aria-labelledby="sign-in-title">
          <p className={styles.kicker}>Secure account</p>
          <h1 id="sign-in-title">
            {flowId ? "Check your email." : "Your money starts with you."}
          </h1>
          <p className={styles.bodyCopy}>
            {flowId
              ? "Enter the six-digit code we sent. Codes are never stored by Home."
              : "Sign in with email to create or restore your user-controlled smart account."}
          </p>

          {authNotice ? (
            <p className={styles.notice} role="status">
              {authNotice}
            </p>
          ) : null}
          {authError ? (
            <p className={styles.error} role="alert">
              {authError}
            </p>
          ) : null}

          {hasVerifiedCode && !flowId ? (
            <div className={styles.pendingPanel} aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              Securing your wallet session…
            </div>
          ) : flowId ? (
            <form className={styles.form} onSubmit={handleOtpSubmit}>
              <div className={styles.fieldHeader}>
                <label htmlFor="account-otp">Verification code</label>
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={handleChangeEmail}
                  disabled={isVerifyingCode || isSendingCode}
                >
                  Change email
                </button>
              </div>
              <input
                id="account-otp"
                className={styles.otpInput}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                disabled={isVerifyingCode}
                aria-describedby="account-otp-help"
                autoFocus
              />
              <p id="account-otp-help" className={styles.fieldHelp}>
                Sent to {email}. The code expires for your protection.
              </p>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={isVerifyingCode || otp.length !== 6}
              >
                {isVerifyingCode ? "Verifying…" : "Verify and continue"}
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={handleResend}
                disabled={isSendingCode || resendSeconds > 0}
              >
                {isSendingCode
                  ? "Sending…"
                  : resendSeconds > 0
                    ? `Resend code in ${resendSeconds}s`
                    : "Resend code"}
              </button>
            </form>
          ) : (
            <form className={styles.form} onSubmit={handleEmailSubmit}>
              <label htmlFor="account-email">Email address</label>
              <input
                id="account-email"
                className={styles.input}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSendingCode}
                required
                autoFocus
              />
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={isSendingCode}
              >
                {isSendingCode ? "Sending code…" : "Continue with email"}
              </button>
            </form>
          )}

          <p className={styles.privacyNote}>
            The wallet SDK manages session recovery. Home does not put your
            email, code, or access token in URLs or app storage.
          </p>
        </section>
      </AccountShell>
    );
  }

  return (
    <AccountShell>
      <section className={styles.card} aria-labelledby="account-title">
        <div className={styles.accountHeading}>
          <div>
            <p className={styles.kicker}>Your account</p>
            <h1 id="account-title">Ready for Base.</h1>
          </div>
          <button
            className={styles.textButton}
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>

        {validationStatus === "validating" || validationStatus === "idle" ? (
          <div className={styles.pendingPanel} aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            Verifying this session with Home…
          </div>
        ) : null}

        {validationStatus === "unavailable" ? (
          <div className={styles.statusPanel} role="alert">
            <strong>Account details are unavailable.</strong>
            <p>{validationMessage}</p>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() =>
                void (isSessionSuppressed ? handleSignOut() : validateSession())
              }
            >
              {isSessionSuppressed ? "Try signing out again" : "Try again"}
            </button>
          </div>
        ) : null}

        {validationStatus === "not-ready" && visibleSession ? (
          <div className={styles.statusPanel} aria-live="polite">
            <strong>Your smart account is still being prepared.</strong>
            <p>
              Home will never substitute an owner wallet address. Try again
              when the Base smart account is ready.
            </p>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void validateSession()}
            >
              Check again
            </button>
          </div>
        ) : null}

        {validationStatus === "verified" && visibleSession?.smartAccount ? (
          <div className={styles.verifiedStack}>
            <div className={styles.verifiedBadge}>
              <span aria-hidden="true">✓</span> Verified session
            </div>
            <dl className={styles.details}>
              <div>
                <dt>CDP identity</dt>
                <dd>{visibleSession.user.subject}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>Base</dd>
              </div>
            </dl>
            <div className={styles.receiveCard}>
              <div>
                <p className={styles.receiveLabel}>Receive address</p>
                <h2>Base smart account</h2>
              </div>
              <code>{visibleSession.smartAccount.address}</code>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={handleCopyAddress}
              >
                {copyStatus === "copied" ? "Copied" : "Copy address"}
              </button>
              <p className={styles.copyStatus} role="status" aria-live="polite">
                {copyStatus === "failed"
                  ? "Copy failed. Select the address manually."
                  : copyStatus === "copied"
                    ? "Smart-account address copied."
                    : "Use this address only on Base."}
              </p>
            </div>
            <p className={styles.identityNote}>
              This provider identity is not a persisted Home user ID. Account
              details appear only after the server verifies your access token.
            </p>
          </div>
        ) : null}
      </section>
    </AccountShell>
  );
}

export function AccountRoute({ projectId }: { projectId: string | null }) {
  if (!projectId) {
    return <AccountUnavailable />;
  }

  return (
    <CdpAccountProvider projectId={projectId}>
      <AccountExperience />
    </CdpAccountProvider>
  );
}
