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
import { createContext, useContext, useMemo, type ReactNode } from "react";

export type AccountWalletClient = {
  isInitialized: boolean;
  isSignedIn: boolean;
  ownerKey: string | null;
  requestEmailCode: (email: string) => Promise<{ flowId: string }>;
  verifyEmailCode: (flowId: string, otp: string) => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AccountWalletContext = createContext<AccountWalletClient | null>(null);

function AccountWalletBridge({ children }: { children: ReactNode }) {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { currentUser } = useCurrentUser();
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { getAccessToken } = useGetAccessToken();
  const { signOut } = useSignOut();

  const client = useMemo<AccountWalletClient>(
    () => ({
      isInitialized,
      isSignedIn,
      ownerKey: currentUser?.userId ?? null,
      requestEmailCode: async (email) => {
        const { flowId } = await signInWithEmail({ email });
        return { flowId };
      },
      verifyEmailCode: async (flowId, otp) => {
        await verifyEmailOTP({ flowId, otp });
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
      signOut,
      verifyEmailOTP,
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
  projectId: string;
  children: ReactNode;
}) {
  const config = useMemo(
    () => ({
      projectId,
      ethereum: { createOnLogin: "smart" as const },
      disableAnalytics: true,
    }),
    [projectId],
  );

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
