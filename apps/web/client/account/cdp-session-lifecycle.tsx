"use client";

import { createContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { AccountSessionStatus, AccountWalletClient, AccountWalletSdkBoundary, BaseAccountLoginPhase } from "./cdp-client";
import { connectBaseAccount, restoreBaseAccount, BaseAccountConnectorError, type BaseAccountConnector, type BaseAccountInvalidation, type BaseAccountRestorer, type ConnectedBaseAccount } from "./base-account-connector";
import { validateAccountSession, type SessionFetch, type VerifiedAccountSession } from "./session-client";
import { BASE_CHAIN_ID, type AccountProvider, type AccountProviderRequest } from "@/shared/account/session-types";
import {
  clearOwnerQueryBoundary,
  OwnerQueryPersistence,
  browserHomeQueryClient,
  useHomeQueryClient,
} from "@/client/query/query-client";
import { useAuthenticatedTransport } from "./cdp-authenticated-transport";
import { useMoneyActionExecution } from "./cdp-money-action-execution";
import { BaseAccountLoginError, baseLoginFailureFromConnector, invalidationMessage, writeAccountProviderHint } from "./cdp-wallet-provider-capabilities";
import { TransferExecutionError } from "@/shared/transfers/types";

export const AccountWalletContext = createContext<AccountWalletClient | null>(null);
export type OwnerGenerationIdentity = number;
export type OwnerGenerationFence = {
  currentOwnerKeyRef: MutableRefObject<string | null>;
  generationRef: MutableRefObject<number>;
  advance: () => number;
  invalidateAuthorization: () => void;
  updateAuthorizationBoundary: (boundary: string | null) => void;
  updateOwnerKey: (ownerKey: string | null) => void;
  capture: (...ignored: unknown[]) => number;
  isCurrent: (identity: number) => boolean;
  assertCurrent: (identity: number) => void;
  isCurrentCleanupIdentity: (identity: { ownerKey: string; generation: number }) => boolean;
};

function useOwnerGenerationFence(
  ownerKey: string | null,
  onAdvance: () => void,
): OwnerGenerationFence {
  const currentOwnerKeyRef = useRef(ownerKey);
  const generationRef = useRef(0);
  const boundaryRef = useRef<string | null>(null);
  const advance = useCallback(() => {
    generationRef.current += 1;
    onAdvance();
    return generationRef.current;
  }, [onAdvance]);
  const updateAuthorizationBoundary = useCallback((boundary: string | null) => {
    if (boundaryRef.current !== boundary) {
      boundaryRef.current = boundary;
      generationRef.current += 1;
      onAdvance();
    }
  }, [onAdvance]);
  const updateOwnerKey = useCallback((next: string | null) => { currentOwnerKeyRef.current = next; }, []);
  const capture = useCallback(() => generationRef.current, []);
  const isCurrent = useCallback((identity: number) => identity === generationRef.current, []);
  const assertCurrent = useCallback((identity: number) => {
    if (identity !== generationRef.current) throw new TransferExecutionError("stale-session");
  }, []);
  const isCurrentCleanupIdentity = useCallback((identity: { ownerKey: string; generation: number }) =>
    identity.generation === generationRef.current &&
    (currentOwnerKeyRef.current === null || currentOwnerKeyRef.current === identity.ownerKey), []);
  return useMemo(() => ({
    currentOwnerKeyRef,
    generationRef,
    advance,
    invalidateAuthorization: advance,
    updateAuthorizationBoundary,
    updateOwnerKey,
    capture,
    isCurrent,
    assertCurrent,
    isCurrentCleanupIdentity,
  }), [advance, assertCurrent, capture, isCurrent, isCurrentCleanupIdentity, updateAuthorizationBoundary, updateOwnerKey]);
}

export function AccountWalletSessionOwner({
  children,
  sdk,
  sessionFetch,
  baseAccountEnabled = false,
  projectConfigured = true,
  baseAccountConnector = connectBaseAccount,
  baseAccountRestorer = restoreBaseAccount,
}: {
  children: ReactNode;
  sdk: AccountWalletSdkBoundary;
  sessionFetch?: SessionFetch;
  baseAccountEnabled?: boolean;
  projectConfigured?: boolean;
  baseAccountConnector?: BaseAccountConnector;
  baseAccountRestorer?: BaseAccountRestorer;
}) {
  const {
    authentication = "cdp",
    initializationError,
    retryInitialization,
    isInitialized,
    isSignedIn,
    ownerKey,
    signInWithEmail,
    verifyEmailOTP,
    signInWithSiwe,
    verifySiweSignature,
    getAccessToken,
    sendUserOperation,
    getUserOperation,
    signOut: sdkSignOut,
  } = sdk;
  const queryClient = useHomeQueryClient(browserHomeQueryClient());
  const ownerBoundaryResetRef = useRef<() => void>(() => {});
  const clearQueryBoundary = useCallback(() => {
    ownerBoundaryResetRef.current();
    clearOwnerQueryBoundary(
      queryClient,
      typeof window === "undefined" ? undefined : window.localStorage,
    );
  }, [queryClient]);
  const fence = useOwnerGenerationFence(ownerKey, clearQueryBoundary);
  const baseConnectionRef = useRef<ConnectedBaseAccount | null>(null);
  const providerRef = useRef<AccountProviderRequest>("restore");
  const cleanupRef = useRef<Promise<void> | null>(null);
  const validationRef = useRef<AbortController | null>(null);
  const previousOwner = useRef(ownerKey);
  const [session, setSession] = useState<VerifiedAccountSession | null>(null);
  const [status, setStatus] = useState<AccountSessionStatus>("restoring");
  const [message, setMessage] = useState<string | null>(null);

  useLayoutEffect(() => {
    fence.updateOwnerKey(ownerKey);
    if (previousOwner.current !== ownerKey) {
      fence.advance();
      validationRef.current?.abort();
      setSession(null);
      setStatus(ownerKey ? "validating" : "signed-out");
    }
    previousOwner.current = ownerKey;
  }, [fence, ownerKey]);

  const clearPrivate = useCallback(() => {
    validationRef.current?.abort();
    setSession(null);
    clearQueryBoundary();
  }, [clearQueryBoundary]);

  const disconnectBase = useCallback(async () => {
    const connection = baseConnectionRef.current;
    baseConnectionRef.current = null;
    await connection?.disconnect();
  }, []);

  const loseVerification = useCallback((text: string) => {
    fence.advance();
    clearPrivate();
    setStatus("signed-out");
    setMessage(text);
  }, [clearPrivate, fence]);

  const onBaseInvalidated = useCallback((reason: BaseAccountInvalidation) => {
    void disconnectBase();
    loseVerification(invalidationMessage(reason));
  }, [disconnectBase, loseVerification]);

  const validate = useCallback(async () => {
    if (!isInitialized || !isSignedIn || !ownerKey) return;
    validationRef.current?.abort();
    const controller = new AbortController();
    validationRef.current = controller;
    const generation = fence.capture();
    setStatus("validating");
    setSession(null);
    try {
      const token = await getAccessToken();
      fence.assertCurrent(generation);
      const verified = await validateAccountSession(token, controller.signal, sessionFetch, {
        accountProvider: providerRef.current,
        authentication,
      });
      fence.assertCurrent(generation);
      if (verified.accountProvider === "base-account") {
        if (!baseAccountEnabled || !verified.smartAccount) throw new Error("Base Account is unavailable.");
        const connection = baseConnectionRef.current ?? await baseAccountRestorer(onBaseInvalidated);
        fence.assertCurrent(generation);
        if (connection.address.toLowerCase() !== verified.smartAccount.address.toLowerCase()) {
          await connection.disconnect();
          throw new Error("Base Account address mismatch.");
        }
        baseConnectionRef.current = connection;
        providerRef.current = "base-account";
        writeAccountProviderHint("base-account");
      } else {
        providerRef.current = "cdp-embedded";
        writeAccountProviderHint("cdp-embedded");
      }
      setSession(verified);
      setStatus("verified");
      setMessage(null);
    } catch (error) {
      if (controller.signal.aborted || !fence.isCurrent(generation)) return;
      if (error instanceof BaseAccountConnectorError && error.reason === "missing-connection") {
        fence.advance();
        clearPrivate();
        setStatus("signing-out");
        setMessage(null);
        providerRef.current = "base-account";
        writeAccountProviderHint("pending:base-account");
        const cleanup = (async () => {
          await disconnectBase();
          await sdkSignOut();
          providerRef.current = "restore";
          writeAccountProviderHint(null);
          setStatus("signed-out");
          setMessage("You are signed out.");
        })();
        cleanupRef.current = cleanup;
        try { await cleanup; }
        catch {
          setStatus("signout-error");
          setMessage("Sign-out did not finish. Retry sign out.");
        } finally { cleanupRef.current = null; }
        return;
      }
      await disconnectBase();
      fence.advance();
      setSession(null);
      setStatus("unavailable");
      setMessage(error instanceof Error ? error.message : "Account verification is unavailable.");
    }
  }, [authentication, baseAccountEnabled, baseAccountRestorer, clearPrivate, disconnectBase, fence, getAccessToken, isInitialized, isSignedIn, onBaseInvalidated, ownerKey, sdkSignOut, sessionFetch]);

  const validateRef = useRef(validate);
  useLayoutEffect(() => { validateRef.current = validate; }, [validate]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || !isInitialized) return;
      if (initializationError) {
        loseVerification("Account verification is unavailable.");
        return;
      }
      if (!isSignedIn || !ownerKey) {
        clearPrivate();
        setStatus(cleanupRef.current ? "signing-out" : "signed-out");
        return;
      }
      void validateRef.current();
    });
    return () => {
      cancelled = true;
      validationRef.current?.abort();
    };
  }, [authentication, baseAccountEnabled, clearPrivate, initializationError, isInitialized, isSignedIn, loseVerification, ownerKey, sessionFetch]);

  const beginSignIn = useCallback((provider: AccountProvider) => {
    if (cleanupRef.current) throw new Error("Sign-out is still finishing.");
    fence.updateAuthorizationBoundary(null);
    const generation = fence.advance();
    clearPrivate();
    providerRef.current = provider;
    writeAccountProviderHint(`pending:${provider}`);
    setStatus("signed-out");
    setMessage(null);
    return generation;
  }, [clearPrivate, fence]);

  const requestEmailCode = useCallback(async (email: string) => {
    const generation = beginSignIn("cdp-embedded");
    fence.assertCurrent(generation);
    const result = await signInWithEmail(email);
    fence.assertCurrent(generation);
    return result;
  }, [beginSignIn, fence, signInWithEmail]);

  const verifyEmailCode = useCallback(async (flowId: string, otp: string) => {
    const generation = fence.capture();
    fence.assertCurrent(generation);
    await verifyEmailOTP(flowId, otp);
    providerRef.current = "cdp-embedded";
    writeAccountProviderHint("cdp-embedded");
  }, [fence, verifyEmailOTP]);

  const signInWithBaseAccount = useCallback(async (onPhase: (phase: BaseAccountLoginPhase) => void) => {
    if (!baseAccountEnabled) throw new BaseAccountLoginError("disabled");
    const generation = beginSignIn("base-account");
    onPhase("connecting");
    let connection: ConnectedBaseAccount | null = null;
    try {
      fence.assertCurrent(generation);
      connection = await baseAccountConnector(onBaseInvalidated);
      fence.assertCurrent(generation);
      baseConnectionRef.current = connection;
      const url = new URL(window.location.href);
      fence.assertCurrent(generation);
      const challenge = await signInWithSiwe({ address: connection.address, chainId: BASE_CHAIN_ID, domain: url.host, uri: url.origin });
      fence.assertCurrent(generation);
      onPhase("signing");
      const signature = await connection.signMessage(challenge.message);
      fence.assertCurrent(generation);
      onPhase("verifying");
      await verifySiweSignature(challenge.flowId, signature);
      providerRef.current = "base-account";
      writeAccountProviderHint("base-account");
    } catch (error) {
      if (baseConnectionRef.current === connection) baseConnectionRef.current = null;
      await connection?.disconnect();
      if (error instanceof BaseAccountConnectorError) throw new BaseAccountLoginError(baseLoginFailureFromConnector(error), error);
      throw new BaseAccountLoginError("provider-unavailable", error);
    }
  }, [baseAccountConnector, baseAccountEnabled, beginSignIn, fence, onBaseInvalidated, signInWithSiwe, verifySiweSignature]);

  const cancelSignInAttempt = useCallback(() => {
    fence.advance();
    clearPrivate();
    void disconnectBase();
    setStatus("signed-out");
    setMessage("Sign-in was canceled.");
  }, [clearPrivate, disconnectBase, fence]);

  const signOut = useCallback(async () => {
    if (cleanupRef.current) return cleanupRef.current;
    fence.advance();
    clearPrivate();
    setStatus("signing-out");
    const cleanup = (async () => {
      await disconnectBase();
      await sdkSignOut();
      providerRef.current = "restore";
      writeAccountProviderHint(null);
      setStatus("signed-out");
      setMessage("You are signed out.");
    })();
    cleanupRef.current = cleanup;
    try { await cleanup; }
    catch {
      setStatus("signout-error");
      setMessage("Sign-out did not finish. Retry sign out.");
      throw new Error("CDP sign-out did not finish.");
    } finally { cleanupRef.current = null; }
  }, [clearPrivate, disconnectBase, fence, sdkSignOut]);

  const authorizationBoundary = session?.smartAccount && ownerKey
    ? `${ownerKey}:${session.user.subject}:${session.smartAccount.address}:${session.accountProvider}`
    : null;
  const persistedOwnerKey = session?.smartAccount
    ? `${session.user.subject}\u0000${session.smartAccount.address.toLowerCase()}\u00008453\u0000${session.accountProvider}`
    : null;
  useLayoutEffect(() => fence.updateAuthorizationBoundary(authorizationBoundary), [authorizationBoundary, fence]);

  const transport = useAuthenticatedTransport({ session, status, ownerKey, ownerFence: fence, getAccessToken, sessionFetch, authentication });
  const moneyActions = useMoneyActionExecution({
    session,
    status,
    ownerKey,
    ownerFence: fence,
    sdkSendUserOperation: sendUserOperation,
    sdkGetUserOperation: getUserOperation,
    getAccessToken,
    sessionFetch,
    authentication,
    baseConnection: baseConnectionRef,
    transport,
  });
  useLayoutEffect(() => {
    ownerBoundaryResetRef.current = () => {
      transport.reset();
      moneyActions.reset();
    };
  }, [moneyActions, transport]);

  const retrySessionValidation = useCallback(async () => {
    if (retryInitialization) await retryInitialization();
    else await validate();
  }, [retryInitialization, validate]);

  const signTypedData = useCallback(async (
    typedData: unknown,
    options?: { evmAccount: `0x${string}`; idempotencyKey: string },
  ) => {
    const generation = fence.capture();
    fence.assertCurrent(generation);
    if (!session?.smartAccount) throw new BaseAccountConnectorError("invalid-provider-response");
    if (session.accountProvider === "base-account") {
      const connection = baseConnectionRef.current;
      if (!connection) throw new BaseAccountConnectorError("invalid-provider-response");
      const signature = await connection.signTypedData(typedData);
      fence.assertCurrent(generation);
      return signature;
    }
    if (!options || options.evmAccount.toLowerCase() === session.smartAccount.address.toLowerCase()) {
      throw new BaseAccountConnectorError("invalid-provider-response");
    }
    const { signEvmTypedData } = await import("@coinbase/cdp-core");
    fence.assertCurrent(generation);
    const result = await signEvmTypedData({
      evmAccount: options.evmAccount,
      typedData: typedData as Parameters<typeof signEvmTypedData>[0]["typedData"],
      idempotencyKey: options.idempotencyKey,
    });
    fence.assertCurrent(generation);
    return result.signature;
  }, [fence, session]);

  const client = useMemo<AccountWalletClient>(() => ({
    projectConfigured,
    signInAvailability: "ready",
    baseAccountEnabled,
    isInitialized,
    isSignedIn,
    ownerKey,
    status,
    session: status === "verified" ? session : null,
    message,
    requestEmailCode,
    verifyEmailCode,
    signInWithBaseAccount,
    cancelSignInAttempt,
    fetchPortfolio: transport.fetchPortfolio,
    fetchPortfolioValuation: transport.fetchPortfolioValuation,
    fetchActivity: transport.fetchActivity,
    fetchSavingsPositions: transport.fetchSavingsPositions,
    fetchAccountResource: transport.fetchAccountResource,
    prepareMoneyAction: moneyActions.prepareMoneyAction,
    resumeMoneyAction: moneyActions.resumeMoneyAction,
    executeMoneyAction: moneyActions.executeMoneyAction,
    fetchOperations: moneyActions.fetchOperations,
    retrySessionValidation,
    signTypedData,
    signOut,
  }), [baseAccountEnabled, cancelSignInAttempt, isInitialized, isSignedIn, message, moneyActions, ownerKey, projectConfigured, requestEmailCode, retrySessionValidation, session, signInWithBaseAccount, signOut, signTypedData, status, transport, verifyEmailCode]);

  return (
    <AccountWalletContext.Provider value={client}>
      <OwnerQueryPersistence ownerKey={persistedOwnerKey} />
      {children}
    </AccountWalletContext.Provider>
  );
}
