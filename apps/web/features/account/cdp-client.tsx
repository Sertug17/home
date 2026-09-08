"use client";

import {
  CDPHooksProvider,
  useCurrentUser,
  useGetAccessToken,
  useIsInitialized,
  useIsSignedIn,
  useSignInWithEmail,
  useSignInWithSiwe,
  useSignOut,
  useVerifyEmailOTP,
  useVerifySiweSignature,
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
  BaseAccountConnectorError,
  connectBaseAccount,
  type BaseAccountConnector,
  type BaseAccountInvalidation,
  type ConnectedBaseAccount,
} from "./base-account-connector";
import {
  getVisibleVerifiedSession,
  SessionValidationError,
  validateAccountSession,
  type SessionFetch,
  type VerifiedAccountSession,
  type VerifiedSessionOwner,
} from "./session-client";
import {
  ACCOUNT_PROVIDER_HEADER,
  BASE_CHAIN_ID,
} from "./session-types";
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

export type BaseAccountLoginPhase =
  | "connecting"
  | "signing"
  | "verifying";

export type BaseAccountLoginFailure =
  | "disabled"
  | "cancelled"
  | "account-changed"
  | "chain-changed"
  | "provider-unavailable"
  | "verification-unsupported";

export class BaseAccountLoginError extends Error {
  readonly reason: BaseAccountLoginFailure;

  constructor(reason: BaseAccountLoginFailure, cause?: unknown) {
    super(reason, { cause });
    this.name = "BaseAccountLoginError";
    this.reason = reason;
  }
}

export type AccountWalletClient = {
  projectConfigured: boolean;
  baseAccountEnabled: boolean;
  isInitialized: boolean;
  isSignedIn: boolean;
  ownerKey: string | null;
  status: AccountSessionStatus;
  session: VerifiedAccountSession | null;
  message: string | null;
  requestEmailCode: (email: string) => Promise<{ flowId: string }>;
  verifyEmailCode: (flowId: string, otp: string) => Promise<void>;
  signInWithBaseAccount: (
    onPhase: (phase: BaseAccountLoginPhase) => void,
  ) => Promise<void>;
  cancelSignInAttempt: () => void;
  fetchPortfolio: (signal?: AbortSignal) => Promise<unknown>;
  fetchActivity: (signal?: AbortSignal) => Promise<unknown>;
  fetchSavingsPositions: (signal?: AbortSignal) => Promise<unknown>;
  retrySessionValidation: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AccountWalletContext = createContext<AccountWalletClient | null>(null);

const unavailableClient: AccountWalletClient = {
  projectConfigured: false,
  baseAccountEnabled: false,
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
  signInWithBaseAccount: async () => {
    throw new BaseAccountLoginError("disabled");
  },
  cancelSignInAttempt: () => {},
  fetchPortfolio: async () => {
    throw new Error("Portfolio is unavailable.");
  },
  fetchActivity: async () => {
    throw new Error("Activity is unavailable.");
  },
  fetchSavingsPositions: async () => {
    throw new Error("Savings positions are unavailable.");
  },
  retrySessionValidation: async () => {},
  signOut: async () => {},
};

export type AccountWalletSdkBoundary = {
  isInitialized: boolean;
  isSignedIn: boolean;
  ownerKey: string | null;
  signInWithEmail: (email: string) => Promise<{ flowId: string }>;
  verifyEmailOTP: (flowId: string, otp: string) => Promise<void>;
  signInWithSiwe: (options: {
    address: `0x${string}`;
    chainId: typeof BASE_CHAIN_ID;
    domain: string;
    uri: string;
  }) => Promise<{ flowId: string; message: string }>;
  verifySiweSignature: (
    flowId: string,
    signature: `0x${string}`,
  ) => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

type AccountSelection =
  | { provider: "cdp-embedded" }
  | {
      provider: "base-account";
      expectedAddress: `0x${string}`;
      ownerKey: string | null;
    };

function embeddedSelection(): AccountSelection {
  return { provider: "cdp-embedded" };
}

function baseLoginFailureFromConnector(
  error: BaseAccountConnectorError,
): BaseAccountLoginFailure {
  switch (error.reason) {
    case "cancelled":
      return "cancelled";
    case "account-changed":
      return "account-changed";
    case "chain-changed":
      return "chain-changed";
    default:
      return "provider-unavailable";
  }
}

function invalidationMessage(reason: BaseAccountInvalidation): string {
  switch (reason) {
    case "account-changed":
      return "The connected Base Account changed. Sign in again to continue.";
    case "chain-changed":
      return "The Base Account network changed. Switch to Base and sign in again.";
    default:
      return "The Base Account disconnected. Sign in again to continue.";
  }
}

export function AccountWalletSessionOwner({
  children,
  sdk,
  sessionFetch,
  baseAccountEnabled = false,
  baseAccountConnector = connectBaseAccount,
}: {
  children: ReactNode;
  sdk: AccountWalletSdkBoundary;
  sessionFetch?: SessionFetch;
  baseAccountEnabled?: boolean;
  baseAccountConnector?: BaseAccountConnector;
}) {
  const {
    isInitialized,
    isSignedIn: sdkIsSignedIn,
    ownerKey,
    signInWithEmail,
    verifyEmailOTP,
    signInWithSiwe,
    verifySiweSignature,
    getAccessToken,
    signOut: sdkSignOut,
  } = sdk;
  const [verifiedOwner, setVerifiedOwner] =
    useState<VerifiedSessionOwner | null>(null);
  const [status, setStatus] = useState<AccountSessionStatus>("restoring");
  const [message, setMessage] = useState<string | null>(null);
  const [suppressedOwnerKey, setSuppressedOwnerKey] = useState<string | null>(
    null,
  );
  const validationRequest = useRef<AbortController | null>(null);
  const validationSequence = useRef(0);
  const accountSelection = useRef<AccountSelection>(embeddedSelection());
  const baseConnection = useRef<ConnectedBaseAccount | null>(null);
  const baseLoginInProgress = useRef(false);
  const signInAttemptSequence = useRef(0);
  const cancelledAttemptAwaitingOwner = useRef(false);
  const cancelledOwnerCleanup = useRef<string | null>(null);
  const currentOwnerKey = useRef(ownerKey);
  const isSessionSuppressed = isSessionSuppressedForOwner(
    suppressedOwnerKey,
    ownerKey,
  );

  useEffect(() => {
    currentOwnerKey.current = ownerKey;
  }, [ownerKey]);

  useEffect(() => {
    if (
      !cancelledAttemptAwaitingOwner.current ||
      !sdkIsSignedIn ||
      !ownerKey ||
      cancelledOwnerCleanup.current === ownerKey
    ) {
      return;
    }

    cancelledOwnerCleanup.current = ownerKey;
    setSuppressedOwnerKey(ownerKey);
    setVerifiedOwner(null);
    setStatus("signed-out");
    setMessage("Sign-in was canceled. Your private details remain hidden.");
    void sdkSignOut()
      .catch(() => {})
      .finally(() => {
        if (currentOwnerKey.current !== ownerKey) {
          cancelledOwnerCleanup.current = null;
        }
      });
  }, [ownerKey, sdkIsSignedIn, sdkSignOut]);

  const clearPrivateState = useCallback(() => {
    validationRequest.current?.abort();
    validationSequence.current += 1;
    setVerifiedOwner(null);
  }, []);

  const clearBaseConnection = useCallback(() => {
    baseLoginInProgress.current = false;
    accountSelection.current = embeddedSelection();
    const connection = baseConnection.current;
    baseConnection.current = null;
    if (connection) {
      void connection.disconnect();
    }
  }, []);

  const rejectBaseSession = useCallback(
    async (failureMessage: string) => {
      clearPrivateState();
      clearBaseConnection();
      setStatus("signed-out");
      setMessage(failureMessage);
      if (!ownerKey) {
        return;
      }
      await signOutWithSessionSuppressed({
        ownerKey,
        signOut: sdkSignOut,
        suppress: setSuppressedOwnerKey,
        onFailure: () => {
          setStatus("signout-error");
          setMessage(
            `${failureMessage} Private details remain hidden, but sign-out did not finish.`,
          );
        },
      });
    }, [clearBaseConnection, clearPrivateState, ownerKey, sdkSignOut]);

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

    let selection = accountSelection.current;
    if (selection.provider === "base-account") {
      if (
        !baseAccountEnabled ||
        (selection.ownerKey !== null && selection.ownerKey !== ownerKey)
      ) {
        clearBaseConnection();
        selection = embeddedSelection();
      } else if (selection.ownerKey === null) {
        selection = { ...selection, ownerKey };
        accountSelection.current = selection;
        baseLoginInProgress.current = false;
      }
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new SessionValidationError("unauthenticated");
      }

      const session = await validateAccountSession(
        accessToken,
        controller.signal,
        sessionFetch,
        {
          accountProvider: selection.provider,
          expectedAddress:
            selection.provider === "base-account"
              ? selection.expectedAddress
              : undefined,
        },
      );
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
        selection.provider === "base-account" &&
        error instanceof SessionValidationError &&
        error.reason === "address-mismatch"
      ) {
        await rejectBaseSession(
          "The server-verified SIWE address did not match the connected Base Account. Sign-in was blocked.",
        );
        return;
      }
      if (
        selection.provider === "base-account" &&
        error instanceof SessionValidationError &&
        error.reason === "invalid-response"
      ) {
        await rejectBaseSession(
          "CDP did not return one verified SIWE address for this Base Account. Sign-in was blocked.",
        );
        return;
      }
      if (
        error instanceof SessionValidationError &&
        error.reason === "unauthenticated"
      ) {
        setStatus("signed-out");
        setMessage("Your session expired. Sign in again to continue.");
        clearBaseConnection();
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
        selection.provider === "base-account"
          ? "Base Account verification is unavailable. Your private details remain hidden."
          : "Account verification is unavailable. Your private details remain hidden.",
      );
    }
  }, [
    baseAccountEnabled,
    clearBaseConnection,
    getAccessToken,
    isInitialized,
    isSessionSuppressed,
    ownerKey,
    rejectBaseSession,
    sdkIsSignedIn,
    sdkSignOut,
    sessionFetch,
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
          if (!baseLoginInProgress.current) {
            clearBaseConnection();
          }
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
    clearBaseConnection,
    clearPrivateState,
    isInitialized,
    isSessionSuppressed,
    ownerKey,
    sdkIsSignedIn,
    validateSession,
  ]);

  const beginSignInAttempt = useCallback(() => {
    const sequence = ++signInAttemptSequence.current;
    cancelledAttemptAwaitingOwner.current = false;
    cancelledOwnerCleanup.current = null;
    clearPrivateState();
    clearBaseConnection();
    setStatus("signed-out");
    setSuppressedOwnerKey(null);
    setMessage(null);
    return sequence;
  }, [clearBaseConnection, clearPrivateState]);

  const cancelSignInAttempt = useCallback(() => {
    signInAttemptSequence.current += 1;
    cancelledAttemptAwaitingOwner.current = true;
    clearPrivateState();
    clearBaseConnection();
    setStatus("signed-out");
    setMessage("Sign-in was canceled. Your private details remain hidden.");

    const activeOwner = currentOwnerKey.current;
    if (activeOwner) {
      cancelledOwnerCleanup.current = activeOwner;
      setSuppressedOwnerKey(activeOwner);
      void sdkSignOut().catch(() => {});
    }
  }, [clearBaseConnection, clearPrivateState, sdkSignOut]);

  const requestEmailCode = useCallback(
    async (email: string) => {
      beginSignInAttempt();
      const { flowId } = await signInWithEmail(email);
      return { flowId };
    }, [beginSignInAttempt, signInWithEmail],
  );

  const verifyEmailCode = useCallback(
    async (flowId: string, otp: string) => {
      setMessage(null);
      await verifyEmailOTP(flowId, otp);
    }, [verifyEmailOTP],
  );

  const signInWithBaseAccount = useCallback(
    async (onPhase: (phase: BaseAccountLoginPhase) => void) => {
      if (!baseAccountEnabled) {
        throw new BaseAccountLoginError("disabled");
      }

      const attemptSequence = beginSignInAttempt();
      baseLoginInProgress.current = true;
      onPhase("connecting");

      const assertCurrentAttempt = () => {
        if (attemptSequence !== signInAttemptSequence.current) {
          throw new BaseAccountConnectorError("cancelled");
        }
      };

      let connection: ConnectedBaseAccount | null = null;
      let stage: "connecting" | "challenge" | "signing" | "verifying" =
        "connecting";
      const handleInvalidation = (reason: BaseAccountInvalidation) => {
        baseLoginInProgress.current = false;
        accountSelection.current = embeddedSelection();
        const invalidatedConnection = baseConnection.current;
        baseConnection.current = null;
        if (invalidatedConnection) {
          void invalidatedConnection.disconnect();
        }
        clearPrivateState();
        setStatus("signed-out");
        setMessage(invalidationMessage(reason));
        const activeOwner = currentOwnerKey.current;
        if (activeOwner) {
          void signOutWithSessionSuppressed({
            ownerKey: activeOwner,
            signOut: sdkSignOut,
            suppress: setSuppressedOwnerKey,
            onFailure: () => {
              setStatus("signout-error");
              setMessage(
                `${invalidationMessage(reason)} Private details remain hidden, but sign-out did not finish.`,
              );
            },
          });
        }
      };

      try {
        connection = await baseAccountConnector(handleInvalidation);
        assertCurrentAttempt();
        baseConnection.current = connection;
        accountSelection.current = {
          provider: "base-account",
          expectedAddress: connection.address,
          ownerKey: null,
        };

        await connection.assertUnchanged();
        stage = "challenge";
        const url = new URL(window.location.href);
        const challenge = await signInWithSiwe({
          address: connection.address,
          chainId: BASE_CHAIN_ID,
          domain: url.host,
          uri: url.origin,
        });
        assertCurrentAttempt();

        await connection.assertUnchanged();
        stage = "signing";
        onPhase("signing");
        const signature = await connection.signMessage(challenge.message);
        assertCurrentAttempt();

        await connection.assertUnchanged();
        stage = "verifying";
        onPhase("verifying");
        await verifySiweSignature(challenge.flowId, signature);
        assertCurrentAttempt();
        await connection.assertUnchanged();
      } catch (error) {
        if (baseConnection.current === connection) {
          clearBaseConnection();
        } else if (connection) {
          await connection.disconnect();
        }
        if (error instanceof BaseAccountConnectorError) {
          throw new BaseAccountLoginError(
            baseLoginFailureFromConnector(error),
            error,
          );
        }
        if (stage === "verifying") {
          try {
            await sdkSignOut();
          } catch {
            // The session remains private even if provider sign-out fails here.
          }
          throw new BaseAccountLoginError("verification-unsupported", error);
        }
        throw new BaseAccountLoginError("provider-unavailable", error);
      }
    }, [
      baseAccountConnector,
      baseAccountEnabled,
      beginSignInAttempt,
      clearBaseConnection,
      clearPrivateState,
      sdkSignOut,
      signInWithSiwe,
      verifySiweSignature,
    ],
  );

  const signOut = useCallback(async () => {
    if (!ownerKey) {
      clearBaseConnection();
      return;
    }

    setStatus("signed-out");
    setMessage(null);
    clearPrivateState();
    clearBaseConnection();
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
  }, [clearBaseConnection, clearPrivateState, ownerKey, sdkSignOut]);

  const session = getVisibleVerifiedSession(
    verifiedOwner,
    ownerKey,
    isSessionSuppressed || status !== "verified",
  );

  const fetchVerifiedResource = useCallback(
    async (endpoint: "/api/portfolio" | "/api/activity" | "/api/savings/positions", signal?: AbortSignal): Promise<unknown> => {
      if (!session || status !== "verified" || !ownerKey) {
        throw new Error("Authenticated resource is unavailable.");
      }
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Authenticated resource is unavailable.");
      }

      let response: Response;
      try {
        response = await (sessionFetch ?? fetch)(endpoint, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            [ACCOUNT_PROVIDER_HEADER]: session.accountProvider,
          },
          cache: "no-store",
          credentials: "same-origin",
          signal,
        });
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        throw new Error("Authenticated resource is unavailable.");
      }
      if (!response.ok) {
        let code: string | null = null;
        try {
          const payload: unknown = await response.json();
          if (
            payload &&
            typeof payload === "object" &&
            "error" in payload &&
            payload.error &&
            typeof payload.error === "object" &&
            "code" in payload.error &&
            typeof payload.error.code === "string"
          ) {
            code = payload.error.code;
          }
        } catch {
          // The fixed-endpoint caller only needs the bounded status/code seam.
        }
        const unavailable = new Error("Authenticated resource is unavailable.");
        Object.assign(unavailable, { status: response.status, code });
        throw unavailable;
      }
      try {
        return await response.json();
      } catch {
        throw new Error("Authenticated resource is unavailable.");
      }
    }, [getAccessToken, ownerKey, session, sessionFetch, status],
  );

  const fetchPortfolio = useCallback(
    (signal?: AbortSignal) => fetchVerifiedResource("/api/portfolio", signal),
    [fetchVerifiedResource],
  );
  const fetchActivity = useCallback(
    (signal?: AbortSignal) => fetchVerifiedResource("/api/activity", signal),
    [fetchVerifiedResource],
  );
  const fetchSavingsPositions = useCallback(
    (signal?: AbortSignal) =>
      fetchVerifiedResource("/api/savings/positions", signal),
    [fetchVerifiedResource],
  );

  const client = useMemo<AccountWalletClient>(
    () => ({
      projectConfigured: true,
      baseAccountEnabled,
      isInitialized,
      isSignedIn: sdkIsSignedIn && !isSessionSuppressed,
      ownerKey,
      status,
      session,
      message,
      requestEmailCode,
      verifyEmailCode,
      signInWithBaseAccount,
      cancelSignInAttempt,
      fetchPortfolio,
      fetchActivity,
      fetchSavingsPositions,
      retrySessionValidation: validateSession,
      signOut,
    }),
    [
      baseAccountEnabled,
      cancelSignInAttempt,
      fetchActivity,
      fetchPortfolio,
      fetchSavingsPositions,
      isInitialized,
      isSessionSuppressed,
      message,
      ownerKey,
      requestEmailCode,
      sdkIsSignedIn,
      session,
      signInWithBaseAccount,
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

function AccountWalletBridge({
  children,
  baseAccountEnabled,
}: {
  children: ReactNode;
  baseAccountEnabled: boolean;
}) {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { currentUser } = useCurrentUser();
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { signInWithSiwe } = useSignInWithSiwe();
  const { verifySiweSignature } = useVerifySiweSignature();
  const { getAccessToken } = useGetAccessToken();
  const { signOut } = useSignOut();
  const sdk = useMemo<AccountWalletSdkBoundary>(
    () => ({
      isInitialized,
      isSignedIn,
      ownerKey: currentUser?.userId ?? null,
      signInWithEmail: async (email) => signInWithEmail({ email }),
      verifyEmailOTP: async (flowId, otp) => {
        await verifyEmailOTP({ flowId, otp });
      },
      signInWithSiwe: async (options) => signInWithSiwe(options),
      verifySiweSignature: async (flowId, signature) => {
        await verifySiweSignature({ flowId, signature });
      },
      getAccessToken,
      signOut,
    }),
    [
      currentUser?.userId,
      getAccessToken,
      isInitialized,
      isSignedIn,
      signInWithEmail,
      signInWithSiwe,
      signOut,
      verifyEmailOTP,
      verifySiweSignature,
    ],
  );

  return (
    <AccountWalletSessionOwner
      sdk={sdk}
      baseAccountEnabled={baseAccountEnabled}
    >
      {children}
    </AccountWalletSessionOwner>
  );
}

export function CdpAccountProvider({
  projectId,
  baseAccountEnabled = false,
  children,
}: {
  projectId: string | null;
  baseAccountEnabled?: boolean;
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
      <AccountWalletBridge baseAccountEnabled={baseAccountEnabled}>
        {children}
      </AccountWalletBridge>
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
