import "@/features/account/dom-test-harness";

import { afterEach, describe, expect, mock, test } from "bun:test";
import type { AccountWalletSdkBoundary } from "@/features/account/cdp-client";
import type {
  BaseAccountConnector,
  ConnectedBaseAccount,
} from "@/features/account/base-account-connector";
import type {
  SessionFetch,
  VerifiedAccountSession,
} from "@/features/account/session-client";
import { ACCOUNT_PROVIDER_HEADER } from "@/features/account/session-types";

const replaceCalls: string[] = [];
mock.module("next/navigation", () => ({
  useRouter: () => ({
    replace: (href: string) => replaceCalls.push(href),
  }),
}));

const { act, cleanup, fireEvent, render, waitFor, within } = await import(
  "@testing-library/react"
);
const { AccountWalletSessionOwner } = await import(
  "@/features/account/cdp-client"
);
const { BASE_CHAIN_ID } = await import("@/features/account/session-client");
const { HomeExperience, PortfolioHomeExperience } = await import(
  "./home-experience"
);

const OWNER = "home-user";
const OWNER_B = "home-user-b";
const ADDRESS = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";

function page() {
  return within(document.body);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function sdk(
  overrides: Partial<AccountWalletSdkBoundary> = {},
): AccountWalletSdkBoundary {
  return {
    isInitialized: true,
    isSignedIn: false,
    ownerKey: null,
    signInWithEmail: async () => ({ flowId: "flow-1" }),
    verifyEmailOTP: async () => {},
    signInWithSiwe: async () => ({
      flowId: "siwe-flow-1",
      message: "fixture SIWE message",
    }),
    verifySiweSignature: async () => {},
    getAccessToken: async () => "fixture-token",
    signOut: async () => {},
    ...overrides,
  };
}

function session(
  smartAccount: VerifiedAccountSession["smartAccount"] = {
    address: ADDRESS,
    chainId: BASE_CHAIN_ID,
  },
  accountProvider: VerifiedAccountSession["accountProvider"] = "cdp-embedded",
  subject = "subject-home",
): VerifiedAccountSession {
  return {
    user: { subject },
    smartAccount,
    accountProvider,
  };
}

function portfolioSnapshot({
  address = ADDRESS,
  usdc = "0",
  eth = "0",
}: {
  address?: typeof ADDRESS | typeof ADDRESS_B;
  usdc?: string;
  eth?: string;
} = {}) {
  return {
    walletAddress: address,
    chainId: BASE_CHAIN_ID,
    blockNumber: "16",
    blockHash: `0x${"ab".repeat(32)}`,
    blockTimestamp: "100",
    fetchedAt: "2026-09-07T20:30:00.000Z",
    assets: [
      {
        id: "usdc",
        symbol: "USDC",
        decimals: 6,
        kind: "erc20",
        tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        balanceBaseUnits: usdc,
      },
      {
        id: "eth",
        symbol: "ETH",
        decimals: 18,
        kind: "native",
        balanceBaseUnits: eth,
      },
    ],
  };
}

function connectedBaseAccount(): ConnectedBaseAccount {
  return {
    address: ADDRESS,
    assertUnchanged: async () => {},
    signMessage: async () => "0x1234",
    disconnect: async () => {},
  };
}

function HomeHarness({
  accountSdk,
  sessionFetch = async () => Response.json(session()),
  initialAccountOpen = false,
  detectedCountry = null,
  routeMode = "dashboard",
}: {
  accountSdk: AccountWalletSdkBoundary;
  sessionFetch?: SessionFetch;
  initialAccountOpen?: boolean;
  detectedCountry?: string | null;
  routeMode?: "landing" | "dashboard";
}) {
  return (
    <AccountWalletSessionOwner sdk={accountSdk} sessionFetch={sessionFetch}>
      <HomeExperience
        detectedCountry={detectedCountry}
        initialAccountOpen={initialAccountOpen}
        routeMode={routeMode}
        savingsContent={<section aria-label="Savings module">Savings fixture</section>}
        assetBalances={{
          status: "ready",
          displayTotal: "12.34 USDC",
          items: [
            {
              id: "usdc",
              name: "USDC",
              detail: "Base account",
              displayBalance: "12.34 USDC",
            },
          ],
        }}
      />
    </AccountWalletSessionOwner>
  );
}

function PortfolioHomeHarness({
  accountSdk,
  sessionFetch,
  detectedCountry = null,
  baseAccountEnabled = false,
  baseAccountConnector,
  routeMode = "dashboard",
}: {
  accountSdk: AccountWalletSdkBoundary;
  sessionFetch: SessionFetch;
  detectedCountry?: string | null;
  baseAccountEnabled?: boolean;
  baseAccountConnector?: BaseAccountConnector;
  routeMode?: "landing" | "dashboard";
}) {
  return (
    <AccountWalletSessionOwner
      sdk={accountSdk}
      sessionFetch={sessionFetch}
      baseAccountEnabled={baseAccountEnabled}
      baseAccountConnector={baseAccountConnector}
    >
      <PortfolioHomeExperience detectedCountry={detectedCountry} routeMode={routeMode} />
    </AccountWalletSessionOwner>
  );
}

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({ matches: true }),
});
HTMLElement.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  replaceCalls.length = 0;
  document.body.style.overflow = "";
});

describe("login-state home experience", () => {
  test("renders a focused sign-in/create-account landing with no dashboard while signed out", async () => {
    render(<HomeHarness accountSdk={sdk()} routeMode="landing" />);

    await page().findByRole("heading", {
      name: "The home for your money.",
    });
    const main = page().getByRole("main");
    expect(within(main).queryByText("USDC balance")).toBeNull();
    expect(within(main).queryByText("Assets")).toBeNull();
    expect(within(main).queryByText("Activity")).toBeNull();
    expect(page().queryByRole("navigation", { name: "Main navigation" })).toBeNull();

    const createAccount = within(main).getByRole("button", {
      name: "Create account",
    });
    createAccount.focus();
    fireEvent.click(createAccount);

    const dialog = await page().findByRole("dialog", { name: "Sign in to Home" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(page().getByRole("textbox", { name: "Email address" })).toBeTruthy();
  });

  test("keeps email OTP open and routes only after the current server-verified login", async () => {
    const signedOutSdk = sdk({
      signInWithEmail: async () => ({ flowId: "email-flow" }),
      verifyEmailOTP: async () => {},
    });
    const view = render(
      <HomeHarness
        accountSdk={signedOutSdk}
        sessionFetch={async () => Response.json(session())}
        routeMode="landing"
      />,
    );

    fireEvent.click(within(page().getByRole("main")).getByRole("button", { name: "Sign in" }));
    const email = await page().findByRole("textbox", { name: "Email address" });
    fireEvent.input(email, { target: { value: "fixture@example.test" } });
    fireEvent.click(page().getByRole("button", { name: "Continue with email" }), {
      detail: 0,
      clientX: 0,
      clientY: 0,
    });
    const otp = await page().findByRole("textbox", { name: "Verification code" });
    expect((page().getByRole("dialog") as HTMLDialogElement).open).toBe(true);
    fireEvent.input(otp, { target: { value: "123456" } });
    fireEvent.click(page().getByRole("button", { name: "Verify and continue" }));

    expect(replaceCalls).not.toContain("/dashboard");
    view.rerender(
      <HomeHarness
        accountSdk={{ ...signedOutSdk, isSignedIn: true, ownerKey: OWNER }}
        sessionFetch={async () => Response.json(session())}
        routeMode="landing"
      />,
    );
    await waitFor(() => expect(replaceCalls).toContain("/dashboard"));
  });

  test("keeps restoration private, then renders the dense verified dashboard", async () => {
    const pendingSession = deferred<Response>();
    render(
      <HomeHarness
        accountSdk={sdk({
          isSignedIn: true,
          ownerKey: OWNER,
        })}
        sessionFetch={() => pendingSession.promise}
      />,
    );

    expect(page().getByRole("heading", { name: "Money and assets" })).toBeTruthy();
    expect(page().getByText("Balances hidden while account verification completes")).toBeTruthy();
    expect(document.body.textContent).not.toContain(ADDRESS);
    expect(page().queryByText("Checking your account…")).toBeNull();

    await act(async () => {
      pendingSession.resolve(Response.json(session()));
      await pendingSession.promise;
    });

    await page().findByRole("heading", { name: "Money and assets" });
    expect(page().getByText("USDC balance")).toBeTruthy();
    expect(page().getByRole("heading", { name: "Assets" })).toBeTruthy();
    expect(page().getByRole("heading", { name: "Activity" })).toBeTruthy();
    expect(page().getByTitle(ADDRESS).textContent).toBe("0x1111…1111");
    expect(page().getAllByText("12.34 USDC").length).toBeGreaterThanOrEqual(1);
    expect(page().queryByText("The home for your money.")).toBeNull();
  });

  test("treats a verified session without a smart account as authenticated but not ready", async () => {
    render(
      <HomeHarness
        accountSdk={sdk({ isSignedIn: true, ownerKey: OWNER })}
        sessionFetch={async () => Response.json(session(null))}
      />,
    );

    await page().findByRole("heading", { name: "Money and assets" });
    expect(page().getByText("Account pending")).toBeTruthy();
    expect(page().getByText("Setup in progress")).toBeTruthy();
    expect(page().queryByText("The home for your money.")).toBeNull();
  });

  test("clears private dashboard content immediately on failed sign-out and exposes manual retry", async () => {
    let signOutCalls = 0;
    render(
      <HomeHarness
        accountSdk={sdk({
          isSignedIn: true,
          ownerKey: OWNER,
          signOut: async () => {
            signOutCalls += 1;
            if (signOutCalls === 1) throw new Error("fixture logout failed");
          },
        })}
      />,
    );

    await page().findByTitle(ADDRESS);
    fireEvent.click(page().getByRole("button", { name: "Sign out" }));

    expect(replaceCalls).toContain("/");
    expect(document.body.textContent).not.toContain("0x1111…1111");
    expect(page().getByText("Balances hidden while account verification completes")).toBeTruthy();

    const retry = await page().findByRole("button", { name: "Retry sign out" });
    fireEvent.click(retry);
    await waitFor(() => expect(signOutCalls).toBe(2));
  });

  test("wires verified balances through the production owner without relabeling or summing unpriced ETH", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const sessionFetch: SessionFetch = async (input, init) => {
      requests.push({ input, init });
      if (input === "/api/session") {
        return Response.json(session());
      }
      return Response.json(
        portfolioSnapshot({ usdc: "0", eth: "1" }),
      );
    };

    render(
      <PortfolioHomeHarness
        accountSdk={sdk({ isSignedIn: true, ownerKey: OWNER })}
        sessionFetch={sessionFetch}
        detectedCountry="BR"
      />,
    );

    await page().findByText("USD/USDC balance · ETH shown separately");
    expect(page().getByRole("heading", { name: "USDC balance" })).toBeTruthy();
    expect(page().getAllByText("0 USDC").length).toBe(2);
    expect(page().getByText("0.000000000000000001 ETH")).toBeTruthy();
    expect(page().getByText("USD / USDC")).toBeTruthy();
    expect(page().getByText("Ethereum")).toBeTruthy();
    expect(document.body.textContent).not.toContain("BRL");
    expect(document.body.textContent).not.toContain("Total balance");
    expect(document.body.textContent).not.toContain("$0");

    const portfolioRequest = requests.find(
      (request) => request.input === "/api/portfolio",
    );
    expect(portfolioRequest).toBeDefined();
    expect(
      new Headers(portfolioRequest?.init?.headers).get(ACCOUNT_PROVIDER_HEADER),
    ).toBe("cdp-embedded");
  });

  test("clears the previous wallet amount before a newly verified owner portfolio resolves", async () => {
    const pendingPortfolio = deferred<Response>();
    const sessionFetch: SessionFetch = async (input, init) => {
      const token = new Headers(init?.headers).get("Authorization");
      const isOwnerB = token === "Bearer token-b";
      if (input === "/api/session") {
        return Response.json(
          isOwnerB
            ? session(
                { address: ADDRESS_B, chainId: BASE_CHAIN_ID },
                "cdp-embedded",
                "subject-home-b",
              )
            : session(),
        );
      }
      if (isOwnerB) {
        return pendingPortfolio.promise;
      }
      return Response.json(portfolioSnapshot({ usdc: "99000000" }));
    };
    const view = render(
      <PortfolioHomeHarness
        accountSdk={sdk({
          isSignedIn: true,
          ownerKey: OWNER,
          getAccessToken: async () => "token-a",
        })}
        sessionFetch={sessionFetch}
      />,
    );

    await page().findAllByText("99 USDC");

    view.rerender(
      <PortfolioHomeHarness
        accountSdk={sdk({
          isSignedIn: true,
          ownerKey: OWNER_B,
          getAccessToken: async () => "token-b",
        })}
        sessionFetch={sessionFetch}
      />,
    );

    await page().findByText("Updating USD/USDC balance");
    expect(page().queryByText("99 USDC")).toBeNull();

    await act(async () => {
      pendingPortfolio.resolve(
        Response.json(
          portfolioSnapshot({ address: ADDRESS_B, usdc: "2500000" }),
        ),
      );
      await pendingPortfolio.promise;
    });
    expect((await page().findAllByText("2.5 USDC")).length).toBe(2);
  });

  test("propagates Base provider selection from sign-in through the real portfolio composition", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const sessionFetch: SessionFetch = async (input, init) => {
      requests.push({ input, init });
      if (input === "/api/session") {
        return Response.json(session(undefined, "base-account", "siwe-subject"));
      }
      return Response.json(portfolioSnapshot({ usdc: "4250000" }));
    };
    const signedOutSdk = sdk({
      isSignedIn: false,
      ownerKey: null,
      signInWithSiwe: async () => ({
        flowId: "siwe-flow",
        message: "fixture SIWE challenge",
      }),
    });
    const view = render(
      <PortfolioHomeHarness
        accountSdk={signedOutSdk}
        sessionFetch={sessionFetch}
        baseAccountEnabled
        baseAccountConnector={async () => connectedBaseAccount()}
        routeMode="landing"
      />,
    );

    await page().findByRole("heading", { name: "The home for your money." });
    fireEvent.click(
      within(page().getByRole("main")).getByRole("button", { name: "Sign in" }),
    );
    fireEvent.click(
      await page().findByRole("button", { name: "Continue with Base Account" }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    view.rerender(
      <PortfolioHomeHarness
        accountSdk={{ ...signedOutSdk, isSignedIn: true, ownerKey: OWNER }}
        sessionFetch={sessionFetch}
        baseAccountEnabled
        baseAccountConnector={async () => connectedBaseAccount()}
        routeMode="dashboard"
      />,
    );

    expect((await page().findAllByText("4.25 USDC")).length).toBe(2);
    const authenticatedRequests = requests.filter(
      (request) =>
        request.input === "/api/session" || request.input === "/api/portfolio",
    );
    expect(authenticatedRequests).toHaveLength(2);
    for (const request of authenticatedRequests) {
      expect(
        new Headers(request.init?.headers).get(ACCOUNT_PROVIDER_HEADER),
      ).toBe("base-account");
    }
  });

  test("keeps navigation, country selection, exact asset units, and account-query sheet behavior reachable", async () => {
    const view = render(
      <HomeHarness
        accountSdk={sdk({ isSignedIn: true, ownerKey: OWNER })}
        detectedCountry="BR"
      />,
    );

    await page().findByTitle(ADDRESS);
    expect(page().getByRole("combobox", { name: "Country" }).textContent).toContain("Brazil");
    expect(page().getAllByText("12.34 USDC").length).toBe(2);

    fireEvent.click(page().getByRole("button", { name: "Save" }));
    const savings = page().getByRole("region", { name: "Savings module" });
    expect(savings).toBeTruthy();
    expect(document.activeElement).toBe(
      document.getElementById("navigation-panel"),
    );

    view.unmount();
    render(<HomeHarness accountSdk={sdk()} initialAccountOpen routeMode="landing" />);
    const dialog = await page().findByRole("dialog", { name: "Sign in to Home" });
    expect((dialog as HTMLDialogElement).open).toBe(true);
    fireEvent.click(page().getByRole("button", { name: "Close sign in" }));
    await waitFor(() => expect(replaceCalls).toEqual(["/"]));
  });
});
