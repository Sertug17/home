import "./dom-test-harness";

import { afterEach, describe, expect, test } from "bun:test";
import type { AccountWalletClient, AccountWalletSdkBoundary } from "./cdp-client";
import type { VerifiedAccountSession } from "./session-client";
import type { PreparedMoneyAction } from "@/shared/money-actions/types";

const { act, cleanup, render, waitFor } = await import("@testing-library/react");
const { useEffect } = await import("react");
const { AccountWalletSessionOwner, useAccountWallet } = await import("./cdp-client");
const { connectWithBaseProvider, restoreWithBaseProvider } = await import("./base-account-connector");

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const ADDRESS_A = "0x1111111111111111111111111111111111111111" as const;
const ADDRESS_B = "0x2222222222222222222222222222222222222222" as const;
const ACTION_ID = "11111111-1111-4111-8111-111111111111";

type ProviderEvent = "accountsChanged" | "chainChanged" | "disconnect";

class ProviderFixture {
  readonly listeners = new Map<ProviderEvent, Set<(value: never) => void>>();
  walletDispatches = 0;

  on(event: ProviderEvent, listener: (value: never) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  removeListener(event: ProviderEvent, listener: (value: never) => void) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: ProviderEvent, value?: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(value as never);
  }

  async request({ method }: { method: string }): Promise<unknown> {
    switch (method) {
      case "wallet_switchEthereumChain": return null;
      case "eth_requestAccounts":
      case "eth_accounts": return [ADDRESS_A];
      case "eth_chainId": return "0x2105";
      case "personal_sign": return "0x1234";
      case "wallet_sendCalls":
        this.walletDispatches += 1;
        return { id: ACTION_ID };
      default: throw new Error(`Unexpected provider request: ${method}`);
    }
  }

  async disconnect() {}
}

function session(
  accountProvider: VerifiedAccountSession["accountProvider"],
  subject = "subject-a",
  address: typeof ADDRESS_A | typeof ADDRESS_B = ADDRESS_A,
): VerifiedAccountSession {
  return {
    user: { subject },
    smartAccount: { address, chainId: 8453 },
    accountProvider,
  };
}

function prepared(active: VerifiedAccountSession): PreparedMoneyAction {
  if (!active.smartAccount) throw new Error("Fixture session requires an account.");
  return {
    id: ACTION_ID,
    reviewHash: "a".repeat(64),
    owner: {
      subject: active.user.subject,
      address: active.smartAccount.address,
      chainId: 8453,
      accountProvider: active.accountProvider,
    },
    kind: "send",
    title: "Send USDC",
    calls: [{ to: ADDRESS_B, data: "0x1234", value: "0" }],
    amounts: [{
      assetId: "usdc",
      symbol: "USDC",
      decimals: 6,
      amountBaseUnits: "1000000",
      direction: "spend",
    }],
    warnings: [],
    createdAt: "2026-09-12T00:00:00.000Z",
    expiresAt: "2026-09-12T00:30:00.000Z",
  };
}

function sdk(overrides: Partial<AccountWalletSdkBoundary> = {}): AccountWalletSdkBoundary {
  return {
    isInitialized: true,
    isSignedIn: true,
    ownerKey: OWNER_A,
    signInWithEmail: async () => ({ flowId: "email-flow" }),
    verifyEmailOTP: async () => {},
    signInWithSiwe: async () => ({ flowId: "siwe-flow", message: "fixture SIWE message" }),
    verifySiweSignature: async () => {},
    getAccessToken: async () => "fixture-token",
    signOut: async () => {},
    ...overrides,
  };
}

let observedClient: AccountWalletClient | null = null;
function ClientProbe() {
  const client = useAccountWallet();
  useEffect(() => { observedClient = client; }, [client]);
  return <output data-testid="status">{client.status}</output>;
}

function currentClient(): AccountWalletClient {
  if (!observedClient) throw new Error("Account client was not rendered.");
  return observedClient;
}

type TriggerContext = {
  provider: ProviderFixture;
  rerender: (nextSdk: AccountWalletSdkBoundary) => void;
  setServerSession: (next: VerifiedAccountSession) => void;
  loseServerVerification: () => void;
};

const triggerRows: Array<{
  name: string;
  initialProvider: VerifiedAccountSession["accountProvider"];
  trigger: (context: TriggerContext) => Promise<void> | void;
}> = [
  {
    name: "sign-out",
    initialProvider: "cdp-embedded",
    trigger: async () => { await currentClient().signOut(); },
  },
  {
    name: "sign-in as a different owner",
    initialProvider: "cdp-embedded",
    trigger: ({ rerender, setServerSession }) => {
      setServerSession(session("cdp-embedded", "subject-b", ADDRESS_B));
      rerender(sdk({ ownerKey: OWNER_B }));
    },
  },
  {
    name: "provider switch",
    initialProvider: "cdp-embedded",
    trigger: async () => { await currentClient().signInWithBaseAccount(() => {}); },
  },
  {
    name: "Base accountsChanged",
    initialProvider: "base-account",
    trigger: ({ provider }) => { provider.emit("accountsChanged", [ADDRESS_B]); },
  },
  {
    name: "Base chainChanged",
    initialProvider: "base-account",
    trigger: ({ provider }) => { provider.emit("chainChanged", "0x1"); },
  },
  {
    name: "Base disconnect",
    initialProvider: "base-account",
    trigger: ({ provider }) => { provider.emit("disconnect"); },
  },
  {
    name: "restored Base address mismatch",
    initialProvider: "base-account",
    trigger: async ({ setServerSession }) => {
      setServerSession(session("base-account", "subject-a", ADDRESS_B));
      await currentClient().retrySessionValidation();
    },
  },
  {
    name: "server verification loss (401)",
    initialProvider: "cdp-embedded",
    trigger: async ({ loseServerVerification }) => {
      loseServerVerification();
      await currentClient().retrySessionValidation();
    },
  },
];

afterEach(() => {
  cleanup();
  observedClient = null;
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("owner generation fence", () => {
  test("blocks prepared actions after every owner-generation trigger", async () => {
    for (const { initialProvider, trigger } of triggerRows) {
      const provider = new ProviderFixture();
    let activeSession = session(initialProvider);
    let verificationLost = false;
    let serverPostsAfterPrepare = 0;
    let cdpDispatches = 0;
    const activeSdk = sdk({
      sendUserOperation: async () => {
        cdpDispatches += 1;
        return { userOperationHash: `0x${"ab".repeat(32)}` };
      },
    });
    const sessionFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/session") {
        return verificationLost ? new Response(null, { status: 401 }) : Response.json(activeSession);
      }
      if (path === "/api/actions/prepare") return Response.json(prepared(activeSession));
      if (init?.method === "POST") serverPostsAfterPrepare += 1;
      if (path.endsWith("/confirm")) return Response.json({ calls: prepared(activeSession).calls });
      return Response.json({});
    };
    const asProvider = provider as unknown as Parameters<typeof connectWithBaseProvider>[0];
    const owner = (ownerSdk: AccountWalletSdkBoundary) => (
      <AccountWalletSessionOwner
        sdk={ownerSdk}
        sessionFetch={sessionFetch}
        baseAccountEnabled
        baseAccountConnector={(onInvalidated) => connectWithBaseProvider(asProvider, onInvalidated)}
        baseAccountRestorer={(onInvalidated) => restoreWithBaseProvider(asProvider, onInvalidated)}
      >
        <ClientProbe />
      </AccountWalletSessionOwner>
    );
    const view = render(owner(activeSdk));

    await waitFor(() => expect(currentClient().status).toBe("verified"));
    const action = await currentClient().prepareMoneyAction("send", { amountBaseUnits: "1000000" });
    serverPostsAfterPrepare = 0;

    await act(async () => {
      await trigger({
        provider,
        rerender: (nextSdk) => view.rerender(owner(nextSdk)),
        setServerSession: (next) => { activeSession = next; },
        loseServerVerification: () => { verificationLost = true; },
      });
    });

      await expect(currentClient().executeMoneyAction(action)).rejects.toMatchObject({
        reason: "stale-session",
      });
      expect(cdpDispatches + provider.walletDispatches).toBe(0);
      expect(serverPostsAfterPrepare).toBe(0);
      cleanup();
      observedClient = null;
      window.sessionStorage.clear();
      window.localStorage.clear();
    }
  });
});
