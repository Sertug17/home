import "./dom-test-harness";

import { afterEach, describe, expect, test } from "bun:test";
import type { AccountWalletSdkBoundary } from "./cdp-client";
import type {
  BaseAccountConnector,
  ConnectedBaseAccount,
} from "./base-account-connector";
import type { SessionFetch, VerifiedAccountSession } from "./session-client";
import { ACCOUNT_PROVIDER_HEADER } from "./session-types";

const { act, cleanup, fireEvent, render, waitFor, within } = await import(
  "@testing-library/react"
);
const {
  AccountWalletSessionOwner,
  CdpAccountProvider,
  useAccountWallet,
} = await import("./cdp-client");
const { BASE_CHAIN_ID } = await import("./session-client");

function page() {
  return within(document.body);
}

const OWNER_A = "sdk-user-a";
const OWNER_B = "sdk-user-b";
const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";

function sessionFor(
  subject: string,
  address: typeof ADDRESS_A | typeof ADDRESS_B,
  accountProvider: VerifiedAccountSession["accountProvider"] = "cdp-embedded",
): VerifiedAccountSession {
  return {
    user: { subject },
    smartAccount: { address, chainId: BASE_CHAIN_ID },
    accountProvider,
  };
}

function sessionResponse(session: VerifiedAccountSession): Response {
  return Response.json(session);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function AccountProbe() {
  const client = useAccountWallet();

  return (
    <div>
      <output data-testid="status">{client.status}</output>
      <output data-testid="address">
        {client.session?.smartAccount?.address ?? "private-details-hidden"}
      </output>
      <output data-testid="message">{client.message ?? ""}</output>
      <output data-testid="provider">
        {client.session?.accountProvider ?? "no-provider"}
      </output>
      <button
        type="button"
        onClick={() => void client.signInWithBaseAccount(() => {}).catch(() => {})}
      >
        Probe Base sign in
      </button>
      <button
        type="button"
        onClick={() => void client.fetchPortfolio().catch(() => {})}
      >
        Probe portfolio
      </button>
      <button
        type="button"
        onClick={() => void client.signOut().catch(() => {})}
      >
        Probe sign out
      </button>
    </div>
  );
}

function SessionHarness({
  sdk,
  sessionFetch,
  baseAccountEnabled = false,
  baseAccountConnector,
}: {
  sdk: AccountWalletSdkBoundary;
  sessionFetch: SessionFetch;
  baseAccountEnabled?: boolean;
  baseAccountConnector?: BaseAccountConnector;
}) {
  return (
    <AccountWalletSessionOwner
      sdk={sdk}
      sessionFetch={sessionFetch}
      baseAccountEnabled={baseAccountEnabled}
      baseAccountConnector={baseAccountConnector}
    >
      <AccountProbe />
    </AccountWalletSessionOwner>
  );
}

function connectedBaseAccount(
  overrides: Partial<ConnectedBaseAccount> = {},
): ConnectedBaseAccount {
  return {
    address: ADDRESS_A,
    assertUnchanged: async () => {},
    signMessage: async () => "0x1234",
    disconnect: async () => {},
    ...overrides,
  };
}

function baseSdk(
  overrides: Partial<AccountWalletSdkBoundary> = {},
): AccountWalletSdkBoundary {
  return {
    isInitialized: true,
    isSignedIn: true,
    ownerKey: OWNER_A,
    signInWithEmail: async () => ({ flowId: "unused-flow" }),
    verifyEmailOTP: async () => {},
    signInWithSiwe: async () => ({
      flowId: "unused-siwe-flow",
      message: "unused SIWE message",
    }),
    verifySiweSignature: async () => {},
    getAccessToken: async () => "token-a",
    signOut: async () => {},
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("production account session owner", () => {
  test("hides a late verification after failed logout, avoids automatic loops, and permits manual retry", async () => {
    const pendingValidation = deferred<Response>();
    let validationCalls = 0;
    let signOutCalls = 0;
    const sessionFetch: SessionFetch = async () => {
      validationCalls += 1;
      return pendingValidation.promise;
    };
    const sdk = baseSdk({
      signOut: async () => {
        signOutCalls += 1;
        if (signOutCalls === 1) {
          throw new Error("fixture sign-out failure");
        }
      },
    });

    render(
      <SessionHarness
        sdk={sdk}
        sessionFetch={sessionFetch}
      />,
    );

    await waitFor(() => expect(validationCalls).toBe(1));
    expect(page().getByTestId("status").textContent).toBe("validating");

    fireEvent.click(page().getByRole("button", { name: "Probe sign out" }));
    await waitFor(() =>
      expect(page().getByTestId("status").textContent).toBe("signout-error"),
    );

    expect(signOutCalls).toBe(1);
    expect(page().getByTestId("status").textContent).toBe("signout-error");
    expect(page().getByTestId("address").textContent).toBe(
      "private-details-hidden",
    );

    await act(async () => {
      pendingValidation.resolve(
        sessionResponse(sessionFor("subject-a", ADDRESS_A)),
      );
      await pendingValidation.promise;
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(validationCalls).toBe(1);
    expect(page().getByTestId("address").textContent).toBe(
      "private-details-hidden",
    );

    fireEvent.click(page().getByRole("button", { name: "Probe sign out" }));
    await waitFor(() => expect(signOutCalls).toBe(2));
    expect(page().getByTestId("status").textContent).toBe("signed-out");
    expect(page().getByTestId("address").textContent).toBe(
      "private-details-hidden",
    );
  });

  test("switches owner A to B without exposing A's late response", async () => {
    const pendingA = deferred<Response>();
    const seenSignals: AbortSignal[] = [];
    const validationTokens: string[] = [];
    const sessionFetch: SessionFetch = async (_input, init) => {
      const token = new Headers(init?.headers).get("Authorization") ?? "";
      validationTokens.push(token);
      if (init?.signal) {
        seenSignals.push(init.signal);
      }
      if (token === "Bearer token-a") {
        return pendingA.promise;
      }
      return sessionResponse(sessionFor("subject-b", ADDRESS_B));
    };
    let accessToken = "token-a";
    const stableSdkFunctions = baseSdk({
      getAccessToken: async () => accessToken,
    });
    const sdkA = { ...stableSdkFunctions, ownerKey: OWNER_A };
    const sdkB = { ...stableSdkFunctions, ownerKey: OWNER_B };
    const view = render(
      <SessionHarness
        sdk={sdkA}
        sessionFetch={sessionFetch}
      />,
    );

    await waitFor(() =>
      expect(validationTokens).toEqual(["Bearer token-a"]),
    );
    accessToken = "token-b";
    view.rerender(
      <SessionHarness
        sdk={sdkB}
        sessionFetch={sessionFetch}
      />,
    );

    await waitFor(() =>
      expect(page().getByTestId("address").textContent).toBe(ADDRESS_B),
    );
    expect(validationTokens).toEqual([
      "Bearer token-a",
      "Bearer token-b",
    ]);
    expect(seenSignals[0]?.aborted).toBe(true);

    await act(async () => {
      pendingA.resolve(sessionResponse(sessionFor("subject-a", ADDRESS_A)));
      await pendingA.promise;
    });

    expect(page().getByTestId("address").textContent).toBe(ADDRESS_B);
  });

  test("keeps a 401-invalid session private and bounds automatic sign-out work", async () => {
    let validationCalls = 0;
    let signOutCalls = 0;
    const sdk = baseSdk({
      signOut: async () => {
        signOutCalls += 1;
        throw new Error("fixture sign-out failure");
      },
    });

    render(
      <SessionHarness
        sdk={sdk}
        sessionFetch={async () => {
          validationCalls += 1;
          return new Response(null, { status: 401 });
        }}
      />,
    );

    await waitFor(() =>
      expect(page().getByTestId("status").textContent).toBe("signout-error"),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(validationCalls).toBe(1);
    expect(signOutCalls).toBe(1);
    expect(page().getByTestId("address").textContent).toBe(
      "private-details-hidden",
    );
  });

  test("validates a reload-restored SDK session before revealing its address", async () => {
    let validationCalls = 0;

    render(
      <SessionHarness
        sdk={baseSdk()}
        sessionFetch={async () => {
          validationCalls += 1;
          return sessionResponse(sessionFor("subject-a", ADDRESS_A));
        }}
      />,
    );

    expect(page().getByTestId("address").textContent).toBe(
      "private-details-hidden",
    );
    await waitFor(() =>
      expect(page().getByTestId("address").textContent).toBe(ADDRESS_A),
    );
    expect(validationCalls).toBe(1);
  });

  test("signs the exact CDP challenge with Base Account and selects only the verified SIWE session", async () => {
    let siweOptions: Parameters<AccountWalletSdkBoundary["signInWithSiwe"]>[0] | null = null;
    let signedMessage: string | null = null;
    let verified: { flowId: string; signature: string } | null = null;
    let selectedProvider: string | null = null;
    const connection = connectedBaseAccount({
      signMessage: async (message) => {
        signedMessage = message;
        return "0xabcd";
      },
    });
    const connector: BaseAccountConnector = async () => connection;
    const signedOutSdk = baseSdk({
      isSignedIn: false,
      ownerKey: null,
      signInWithSiwe: async (options) => {
        siweOptions = options;
        return { flowId: "siwe-flow", message: "exact CDP SIWE message" };
      },
      verifySiweSignature: async (flowId, signature) => {
        verified = { flowId, signature };
      },
    });
    const sessionFetch: SessionFetch = async (input, init) => {
      expect(input).toBe("/api/session");
      selectedProvider = new Headers(init?.headers).get(
        ACCOUNT_PROVIDER_HEADER,
      );
      return sessionResponse(
        sessionFor("siwe-subject", ADDRESS_A, "base-account"),
      );
    };
    const view = render(
      <SessionHarness
        sdk={signedOutSdk}
        sessionFetch={sessionFetch}
        baseAccountEnabled
        baseAccountConnector={connector}
      />,
    );

    fireEvent.click(page().getByRole("button", { name: "Probe Base sign in" }));
    await waitFor(() => expect(verified).not.toBeNull());
    expect(siweOptions as unknown).toEqual({
      address: ADDRESS_A,
      chainId: 8453,
      domain: "localhost:3111",
      uri: "http://localhost:3111",
    });
    expect(signedMessage as unknown).toBe("exact CDP SIWE message");
    expect(verified as unknown).toEqual({
      flowId: "siwe-flow",
      signature: "0xabcd",
    });

    view.rerender(
      <SessionHarness
        sdk={{ ...signedOutSdk, isSignedIn: true, ownerKey: OWNER_A }}
        sessionFetch={sessionFetch}
        baseAccountEnabled
        baseAccountConnector={connector}
      />,
    );

    await waitFor(() =>
      expect(page().getByTestId("address").textContent).toBe(ADDRESS_A),
    );
    expect(page().getByTestId("provider").textContent).toBe("base-account");
    expect(selectedProvider as unknown).toBe("base-account");
  });

  test("does not initialize the Base SDK while the deployment flag is off", async () => {
    let connectorCalls = 0;
    render(
      <SessionHarness
        sdk={baseSdk({ isSignedIn: false, ownerKey: null })}
        sessionFetch={async () =>
          sessionResponse(sessionFor("unexpected", ADDRESS_A))
        }
        baseAccountConnector={async () => {
          connectorCalls += 1;
          return connectedBaseAccount();
        }}
      />,
    );

    fireEvent.click(page().getByRole("button", { name: "Probe Base sign in" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(connectorCalls).toBe(0);
    expect(page().getByTestId("address").textContent).toBe(
      "private-details-hidden",
    );
  });

  test("fails closed when hosted SIWE verification rejects the smart-account signature", async () => {
    let disconnectCalls = 0;
    let sessionCalls = 0;
    const sdk = baseSdk({
      isSignedIn: false,
      ownerKey: null,
      verifySiweSignature: async () => {
        throw new Error("fixture hosted verifier rejection");
      },
    });

    render(
      <SessionHarness
        sdk={sdk}
        sessionFetch={async () => {
          sessionCalls += 1;
          return sessionResponse(sessionFor("unexpected", ADDRESS_A));
        }}
        baseAccountEnabled
        baseAccountConnector={async () =>
          connectedBaseAccount({
            disconnect: async () => {
              disconnectCalls += 1;
            },
          })
        }
      />,
    );

    fireEvent.click(page().getByRole("button", { name: "Probe Base sign in" }));
    await waitFor(() => expect(disconnectCalls).toBe(1));
    expect(sessionCalls).toBe(0);
    expect(page().getByTestId("address").textContent).toBe(
      "private-details-hidden",
    );
    expect(page().getByTestId("provider").textContent).toBe("no-provider");
  });

  test("blocks and signs out when the server SIWE address differs from the connected Base Account", async () => {
    let signOutCalls = 0;
    const signedOutSdk = baseSdk({
      isSignedIn: false,
      ownerKey: null,
      signOut: async () => {
        signOutCalls += 1;
      },
    });
    const view = render(
      <SessionHarness
        sdk={signedOutSdk}
        sessionFetch={async () =>
          sessionResponse(
            sessionFor("siwe-subject", ADDRESS_B, "base-account"),
          )
        }
        baseAccountEnabled
        baseAccountConnector={async () => connectedBaseAccount()}
      />,
    );

    fireEvent.click(page().getByRole("button", { name: "Probe Base sign in" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    view.rerender(
      <SessionHarness
        sdk={{ ...signedOutSdk, isSignedIn: true, ownerKey: OWNER_A }}
        sessionFetch={async () =>
          sessionResponse(
            sessionFor("siwe-subject", ADDRESS_B, "base-account"),
          )
        }
        baseAccountEnabled
        baseAccountConnector={async () => connectedBaseAccount()}
      />,
    );

    await waitFor(() => expect(signOutCalls).toBe(1));
    expect(page().getByTestId("status").textContent).toBe("signed-out");
    expect(page().getByTestId("address").textContent).toBe(
      "private-details-hidden",
    );
    expect(page().getByTestId("message").textContent).toContain(
      "did not match",
    );
  });

  test("keeps Base mode on the fixed same-origin portfolio request", async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const sessionFetch: SessionFetch = async (input, init) => {
      requests.push({ input, init });
      if (input === "/api/session") {
        return sessionResponse(
          sessionFor("siwe-subject", ADDRESS_A, "base-account"),
        );
      }
      return Response.json({ wallet: ADDRESS_A });
    };
    const signedOutSdk = baseSdk({ isSignedIn: false, ownerKey: null });
    const view = render(
      <SessionHarness
        sdk={signedOutSdk}
        sessionFetch={sessionFetch}
        baseAccountEnabled
        baseAccountConnector={async () => connectedBaseAccount()}
      />,
    );
    fireEvent.click(page().getByRole("button", { name: "Probe Base sign in" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    view.rerender(
      <SessionHarness
        sdk={{ ...signedOutSdk, isSignedIn: true, ownerKey: OWNER_A }}
        sessionFetch={sessionFetch}
        baseAccountEnabled
        baseAccountConnector={async () => connectedBaseAccount()}
      />,
    );
    await waitFor(() =>
      expect(page().getByTestId("address").textContent).toBe(ADDRESS_A),
    );

    fireEvent.click(page().getByRole("button", { name: "Probe portfolio" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    const portfolioRequest = requests[1];
    expect(portfolioRequest?.input).toBe("/api/portfolio");
    expect(portfolioRequest?.init?.method).toBe("GET");
    expect(portfolioRequest?.init?.cache).toBe("no-store");
    expect(portfolioRequest?.init?.credentials).toBe("same-origin");
    expect(
      new Headers(portfolioRequest?.init?.headers).get(ACCOUNT_PROVIDER_HEADER),
    ).toBe("base-account");
  });

  test("is inert when the public project configuration is missing", async () => {
    render(
      <CdpAccountProvider projectId={null}>
        <AccountProbe />
      </CdpAccountProvider>,
    );

    expect(page().getByTestId("status").textContent).toBe("signed-out");
    expect(page().getByTestId("address").textContent).toBe(
      "private-details-hidden",
    );
    fireEvent.click(page().getByRole("button", { name: "Probe sign out" }));
    expect(page().getByTestId("status").textContent).toBe("signed-out");
  });
});
