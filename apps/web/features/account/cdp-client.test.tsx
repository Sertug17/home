import "./dom-test-harness";

import { afterEach, describe, expect, test } from "bun:test";
import type { AccountWalletSdkBoundary } from "./cdp-client";
import type { SessionFetch, VerifiedAccountSession } from "./session-client";

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
): VerifiedAccountSession {
  return {
    user: { subject },
    smartAccount: { address, chainId: BASE_CHAIN_ID },
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
}: {
  sdk: AccountWalletSdkBoundary;
  sessionFetch: SessionFetch;
}) {
  return (
    <AccountWalletSessionOwner
      sdk={sdk}
      sessionFetch={sessionFetch}
    >
      <AccountProbe />
    </AccountWalletSessionOwner>
  );
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
