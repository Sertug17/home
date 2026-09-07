"use client";

import {
  useEffect,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { classifyEmailCodeError } from "./auth-errors";
import { useAccountWallet } from "./cdp-client";
import styles from "./account.module.css";

const RESEND_COOLDOWN_SECONDS = 30;

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

export function AccountSignInSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    projectConfigured,
    status,
    session,
    message,
    requestEmailCode,
    verifyEmailCode,
    retrySessionValidation,
  } = useAccountWallet();
  const [email, setEmail] = useState("");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (session && status === "verified") {
      onClose();
    }
  }, [onClose, session, status]);

  useEffect(() => {
    if (!open || resendAvailableAt === null) {
      return;
    }

    const update = () => {
      setResendSeconds(
        Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000)),
      );
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [open, resendAvailableAt]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSendingCode && !isVerifyingCode) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSendingCode, isVerifyingCode, onClose, open]);

  if (!open) {
    return null;
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !isSendingCode && !isVerifyingCode) {
      onClose();
    }
  }

  async function sendCode(nextEmail: string) {
    setIsSendingCode(true);
    setAuthError(null);
    try {
      const result = await requestEmailCode(nextEmail);
      setFlowId(result.flowId);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
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
      setResendAvailableAt(null);
    } catch (error) {
      setAuthError(messageForCodeError(error));
    } finally {
      setIsVerifyingCode(false);
    }
  }

  function changeEmail() {
    setFlowId(null);
    setOtp("");
    setAuthError(null);
    setResendAvailableAt(null);
    setResendSeconds(0);
  }

  const isChecking = status === "restoring" || status === "validating";

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={handleBackdropClick}
    >
      <section
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-sign-in-title"
      >
        <div className={styles.sheetHeader}>
          <div>
            <p className={styles.kicker}>Secure account</p>
            <h2 id="account-sign-in-title">
              {flowId ? "Check your email" : "Sign in to Home"}
            </h2>
          </div>
          <button
            className={styles.closeButton}
            type="button"
            onClick={onClose}
            disabled={isSendingCode || isVerifyingCode}
            aria-label="Close sign in"
          >
            ×
          </button>
        </div>

        {!projectConfigured ? (
          <div className={styles.statusPanel} role="alert">
            <strong>Sign-in is unavailable.</strong>
            <p>Add the public CDP project ID to this deployment.</p>
          </div>
        ) : null}

        {message && status !== "signed-out" ? (
          <p className={styles.notice} role="status">
            {message}
          </p>
        ) : null}
        {authError ? (
          <p className={styles.error} role="alert">
            {authError}
          </p>
        ) : null}

        {isChecking ? (
          <div className={styles.pendingPanel} aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            Verifying your secure session…
          </div>
        ) : status === "unavailable" ? (
          <div className={styles.statusPanel} role="alert">
            <strong>We could not verify this session.</strong>
            <p>Your account details remain hidden.</p>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void retrySessionValidation()}
            >
              Try again
            </button>
          </div>
        ) : projectConfigured && flowId ? (
          <form className={styles.form} onSubmit={handleOtpSubmit}>
            <div className={styles.fieldHeader}>
              <label htmlFor="account-otp">Verification code</label>
              <button
                className={styles.textButton}
                type="button"
                onClick={changeEmail}
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
              onClick={() => {
                setOtp("");
                void sendCode(email);
              }}
              disabled={isSendingCode || resendSeconds > 0}
            >
              {isSendingCode
                ? "Sending…"
                : resendSeconds > 0
                  ? `Resend code in ${resendSeconds}s`
                  : "Resend code"}
            </button>
          </form>
        ) : projectConfigured ? (
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
        ) : null}

        <p className={styles.privacyNote}>
          Home shows account details only after the server verifies the CDP
          access token. Your email and code are never placed in the URL.
        </p>
      </section>
    </div>
  );
}
