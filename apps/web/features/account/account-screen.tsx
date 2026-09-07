"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
import { classifyEmailCodeError } from "./auth-errors";
import {
  BaseAccountLoginError,
  useAccountWallet,
  type BaseAccountLoginPhase,
} from "./cdp-client";
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

function messageForBaseAccountError(error: unknown): string {
  if (!(error instanceof BaseAccountLoginError)) {
    return "Base Account sign-in is unavailable. Your account remains signed out.";
  }

  switch (error.reason) {
    case "cancelled":
      return "Base Account sign-in was canceled. No session was created.";
    case "account-changed":
      return "The Base Account changed during sign-in. Reconnect and try again.";
    case "chain-changed":
      return "The network changed during sign-in. Switch to Base and try again.";
    case "verification-unsupported":
      return "CDP could not verify this Base Account signature. Your account remains signed out; this smart-account signature is not supported by the configured verifier.";
    case "disabled":
      return "Base Account sign-in is not enabled for this deployment.";
    default:
      return "We could not connect to Base Account. Your account remains signed out.";
  }
}

function baseAccountPhaseMessage(phase: BaseAccountLoginPhase): string {
  switch (phase) {
    case "connecting":
      return "Connecting to your existing Base Account…";
    case "signing":
      return "Confirm the exact CDP sign-in message in Base Account…";
    case "verifying":
      return "Verifying the Base Account signature with CDP…";
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
    baseAccountEnabled,
    status,
    session,
    message,
    requestEmailCode,
    verifyEmailCode,
    signInWithBaseAccount,
    retrySessionValidation,
  } = useAccountWallet();
  const [email, setEmail] = useState("");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [baseAccountPhase, setBaseAccountPhase] =
    useState<BaseAccountLoginPhase | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const baseAccountFailed =
    status === "unavailable" ||
    status === "signout-error" ||
    (status === "signed-out" && message !== null);
  const activeBaseAccountPhase = baseAccountFailed ? null : baseAccountPhase;
  const isBusy =
    isSendingCode || isVerifyingCode || activeBaseAccountPhase !== null;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
      const initialFocus = dialog.querySelector<HTMLElement>(
        "[data-initial-focus]:not(:disabled), button:not(:disabled)",
      );
      initialFocus?.focus();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

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

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!isBusy) {
      onClose();
    }
  }

  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const clickedOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    if (clickedOutside && !isBusy) {
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

  async function handleBaseAccountSignIn() {
    setAuthError(null);
    try {
      await signInWithBaseAccount(setBaseAccountPhase);
    } catch (error) {
      setBaseAccountPhase(null);
      setAuthError(messageForBaseAccountError(error));
    }
  }

  const isChecking = status === "restoring" || status === "validating";

  return (
    <dialog
      ref={dialogRef}
      className={styles.sheet}
      aria-labelledby="account-sign-in-title"
      onCancel={handleCancel}
      onClick={handleDialogClick}
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
          disabled={isBusy}
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

      {message ? (
        <p className={styles.notice} role="status">
          {message}
        </p>
      ) : null}
      {authError ? (
        <p className={styles.error} role="alert">
          {authError}
        </p>
      ) : null}

      {activeBaseAccountPhase ? (
        <div className={styles.pendingPanel} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          {baseAccountPhaseMessage(activeBaseAccountPhase)}
        </div>
      ) : isChecking ? (
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
            data-initial-focus
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
            data-initial-focus
          />
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={isSendingCode}
          >
            {isSendingCode ? "Sending code…" : "Continue with email"}
          </button>
          {baseAccountEnabled ? (
            <>
              <div className={styles.signInDivider} role="separator">
                <span>or</span>
              </div>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void handleBaseAccountSignIn()}
              >
                Continue with Base Account
              </button>
              <p className={styles.fieldHelp}>
                Uses the existing Base Account you select. Home accepts only
                the SIWE address returned by server-side CDP verification.
              </p>
            </>
          ) : null}
        </form>
      ) : null}

      <p className={styles.privacyNote}>
        Home shows account details only after the server verifies the CDP
        access token. Your email and code are never placed in the URL.
      </p>
    </dialog>
  );
}
