"use client";

import {
  CDPHooksProvider,
  useCurrentUser,
  useGetAccessToken,
  useIsInitialized,
  useIsSignedIn,
  useSignInWithEmail,
  useSignOut,
  useVerifyEmailOTP,
} from "@coinbase/cdp-hooks";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getVisibleVerifiedSession,
  SessionValidationError,
  validateAccountSession,
  type VerifiedAccountSession,
  type VerifiedSessionOwner,
} from "./session-client";
import {
  isSessionSuppressedForOwner,
  signOutWithSessionSuppressed,
} from "./session-sign-out";

export type AccountSessionStatus =
  | "restoring"
  | "signed-out"
  | "validating"
  | "verified"
  | "unavailable"
  | "signout-error";

export type AccountWalletClient = {
  projectConfigured: boolean;
  isInitialized: boolean;
  isSignedIn: boolean;
  ownerKey: string | null;
  status: AccountSessionStatus;
  session: VerifiedAccountSession | null;
  message: string | null;
  requestEmailCode: (email: string) => Promise<{ flowId: string }>;
  verifyEmailCode: (flowId: string, otp: string) => Promise<void>;
  retrySessionValidation: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AccountWalletContext = createContext<AccountWalletClient | null>(null);

const unavailableClient: AccountWalletClient = {
  projectConfigured: false,
  isInitialized: true,
  isSignedIn: false,
  ownerKey: null,
  status: "signed-out",
  session: null,
  message: "Sign-in is not configured for this deployment.",
  requestEmailCode: async () => {
    throw new Error("CDP project is not configured.");
  },
  verifyEmailCode: async () => {
    throw new Error("CDP project is not configured.");
  },
  retrySessionValidation: async () => {},
  signOut: async () => {},
};

function AccountWalletBridge({ children }: { children: ReactNode }) {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn: sdkIsSignedIn } = useIsSignedIn();
  const { currentUser } = useCurrentUser();
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { getAccessToken } = useGetAccessToken();
  const { signOut: sdkSignOut } = useSignOut();
  const [verifiedOwner, setVerifiedOwner] =
    useState<VerifiedSessionOwner | null>(null);
  const [status, setStatus] = useState<AccountSessionStatus>("restoring");
  const [message, setMessage] = useState<string | null>(null);
  const [suppressedOwnerKey, setSuppressedOwnerKey] = useState<string | null>(
    null,
  );
  const validationRequest = useRef<AbortController | null>(null);
  const validationSequence = useRef(0);
  const ownerKey = currentUser?.userId ?? null;
  const isSessionSuppressed = isSessionSuppressedForOwner(
    suppressedOwnerKey,
    ownerKey,
  );

  const clearPrivateState = useCallback(() => {
    validationRequest.current?.abort();
    validationSequence.current += 1;
    setVerifiedOwner(null);
  }, []);

  const validateSession = useCallback(async () => {
    if (!isInitialized || !sdkIsSignedIn || !ownerKey || isSessionSuppressed) {
      return;
    }

    validationRequest.current?.abort();
    const controller = new AbortController();
    const sequence = ++validationSequence.current;
    validationRequest.current = controller;
    setVerifiedOwner(null);
    setStatus("validating");
    setMessage(null);

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
      setStatus("verified");
    } catch (error) {
      if (controller.signal.aborted || sequence !== validationSequence.current) {
        return;
      }

      setVerifiedOwner(null);
      if (
        error instanceof SessionValidationError &&
        error.reason === "unauthenticated"
      ) {
        setStatus("signed-out");
        setMessage("Your session expired. Sign in again to continue.");
        await signOutWithSessionSuppressed({
          ownerKey,
          signOut: sdkSignOut,
          suppress: setSuppressedOwnerKey,
          onFailure: () => {
            setStatus("signout-error");
            setMessage(
              "Your private details are hidden, but sign-out did not finish. Retry sign out.",
            );
          },
        });
        return;
      }

      setStatus("unavailable");
      setMessage(
        "Account verification is unavailable. Your private details remain hidden.",
      );
    }
  }, [
    getAccessToken,
    isInitialized,
    isSessionSuppressed,
    ownerKey,
    sdkIsSignedIn,
    sdkSignOut,
  ]);

  useEffect(() => {
    if (!isInitialized) {
      validationRequest.current?.abort();
      return;
    }

    if (!sdkIsSignedIn || !ownerKey) {
      const timer = window.setTimeout(() => {
        clearPrivateState();
        setStatus("signed-out");
        if (!isSessionSuppressed) {
          setMessage(null);
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (isSessionSuppressed) {
      validationRequest.current?.abort();
      return;
    }

    const timer = window.setTimeout(() => void validateSession(), 0);
    return () => {
      window.clearTimeout(timer);
      validationRequest.current?.abort();
    };
  }, [
    clearPrivateState,
    isInitialized,
    isSessionSuppressed,
    ownerKey,
    sdkIsSignedIn,
    validateSession,
  ]);

  const requestEmailCode = useCallback(
    async (email: string) => {
      setSuppressedOwnerKey(null);
      setMessage(null);
      const { flowId } = await signInWithEmail({ email });
      return { flowId };
    },
    [signInWithEmail],
  );

  const verifyEmailCode = useCallback(
    async (flowId: string, otp: string) => {
      setSuppressedOwnerKey(null);
      setMessage(null);
      await verifyEmailOTP({ flowId, otp });
    },
    [verifyEmailOTP],
  );

  const signOut = useCallback(async () => {
    if (!ownerKey) {
      return;
    }

    setStatus("signed-out");
    setMessage(null);
    clearPrivateState();
    const signedOut = await signOutWithSessionSuppressed({
      ownerKey,
      signOut: sdkSignOut,
      suppress: setSuppressedOwnerKey,
      onFailure: () => {
        setStatus("signout-error");
        setMessage(
          "Your private details are hidden, but sign-out did not finish. Retry sign out.",
        );
      },
    });

    if (signedOut) {
      setMessage("You are signed out.");
      return;
    }

    throw new Error("CDP sign-out did not finish.");
  }, [clearPrivateState, ownerKey, sdkSignOut]);

  const session = getVisibleVerifiedSession(
    verifiedOwner,
    ownerKey,
    isSessionSuppressed || status !== "verified",
  );

  const client = useMemo<AccountWalletClient>(
    () => ({
      projectConfigured: true,
      isInitialized,
      isSignedIn: sdkIsSignedIn && !isSessionSuppressed,
      ownerKey,
      status,
      session,
      message,
      requestEmailCode,
      verifyEmailCode,
      retrySessionValidation: validateSession,
      signOut,
    }),
    [
      isInitialized,
      isSessionSuppressed,
      message,
      ownerKey,
      requestEmailCode,
      sdkIsSignedIn,
      session,
      signOut,
      status,
      validateSession,
      verifyEmailCode,
    ],
  );

  return (
    <AccountWalletContext.Provider value={client}>
      {children}
    </AccountWalletContext.Provider>
  );
}

export function CdpAccountProvider({
  projectId,
  children,
}: {
  projectId: string | null;
  children: ReactNode;
}) {
  const config = useMemo(
    () =>
      projectId
        ? {
            projectId,
            ethereum: { createOnLogin: "smart" as const },
            disableAnalytics: true,
          }
        : null,
    [projectId],
  );

  if (!config) {
    return (
      <AccountWalletContext.Provider value={unavailableClient}>
        {children}
      </AccountWalletContext.Provider>
    );
  }

  return (
    <CDPHooksProvider config={config}>
      <AccountWalletBridge>{children}</AccountWalletBridge>
    </CDPHooksProvider>
  );
}

export function useAccountWallet(): AccountWalletClient {
  const client = useContext(AccountWalletContext);
  if (!client) {
    throw new Error("Account wallet client is unavailable outside its provider.");
  }
  return client;
}
