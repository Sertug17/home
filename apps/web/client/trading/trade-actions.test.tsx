import "@/client/account/dom-test-harness";

import { verifiedAccountWalletClient } from "@/tests/helpers/account-wallet";
import { page } from "@/tests/helpers/dom";
import { afterEach, describe, expect, jest, test } from "bun:test";
import type { AccountWalletClient } from "@/client/account/cdp-client";
import { cryptoAssets } from "@/config/invest-assets";

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const {
  AccountWalletClientProvider,
  createBlockedAccountWalletClient,
} = await import("@/client/account/cdp-client");
const { TradeActions } = await import("./trade-actions");

const bitcoin = cryptoAssets.find((asset) => asset.id === "cbbtc")!;

afterEach(() => {
  jest.useRealTimers();
  cleanup();
});

describe("TradeActions canTrade", () => {
  test("enables Buy and Sell for verified email CDP and Base Account sessions", () => {
    for (const provider of ["cdp-embedded", "base-account"] as const) {
      cleanup();
      render(
        <AccountWalletClientProvider client={verifiedAccountWalletClient({ accountProvider: provider })}>
          <TradeActions asset={bitcoin} />
        </AccountWalletClientProvider>,
      );
      const buy = page().getByRole("button", { name: "Buy" }) as HTMLButtonElement;
      const sell = page().getByRole("button", { name: "Sell" }) as HTMLButtonElement;
      expect(buy.disabled).toBe(false);
      expect(sell.disabled).toBe(false);
    }
  });

  test("keeps Buy and Sell disabled without a verified trade boundary", () => {
    render(
      <AccountWalletClientProvider client={createBlockedAccountWalletClient("unconfigured")}>
        <TradeActions asset={bitcoin} />
      </AccountWalletClientProvider>,
    );
    const buy = page().getByRole("button", { name: "Buy" }) as HTMLButtonElement;
    const sell = page().getByRole("button", { name: "Sell" }) as HTMLButtonElement;
    expect(buy.disabled).toBe(true);
    expect(sell.disabled).toBe(true);
  });
});

describe("TradeActions private amount dismissal", () => {
  function renderTrade(client: AccountWalletClient) {
    return render(
      <AccountWalletClientProvider client={client}>
        <TradeActions asset={bitcoin} />
      </AccountWalletClientProvider>,
    );
  }

  function composeThirteen() {
    fireEvent.click(page().getByRole("button", { name: "Buy" }));
    fireEvent.click(page().getByRole("button", { name: "1" }));
    fireEvent.click(page().getByRole("button", { name: "3" }));
    expect(document.querySelector("[data-primary-amount]")?.textContent).toBe("$13");
  }

  function rerenderTrade(
    view: ReturnType<typeof render>,
    client: AccountWalletClient,
  ) {
    view.rerender(
      <AccountWalletClientProvider client={client}>
        <TradeActions asset={bitcoin} />
      </AccountWalletClientProvider>,
    );
  }

  test("drops the previous owner's $13 immediately when the account changes", () => {
    const view = renderTrade(verifiedAccountWalletClient());
    composeThirteen();

    rerenderTrade(view, verifiedAccountWalletClient({ owner: "b" }));

    expect(document.querySelector("[data-primary-amount]")).toBeNull();
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  test("drops the previous owner's $13 immediately on sign-out", () => {
    const view = renderTrade(verifiedAccountWalletClient());
    composeThirteen();

    rerenderTrade(view, createBlockedAccountWalletClient("unconfigured"));

    expect(document.querySelector("[data-primary-amount]")).toBeNull();
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  test("aborts a pending prepare on owner change and lets the next owner compose", () => {
    const pending = pendingPrepareClient("a");
    const view = renderTrade(pending.client);
    composeThirteen();
    fireEvent.click(page().getByRole("button", { name: "Continue" }));

    expect(page().getByRole("button", { name: "Preparing…" })).toBeTruthy();
    expect(pending.signal()?.aborted).toBe(false);

    rerenderTrade(view, verifiedAccountWalletClient({ owner: "b" }));

    expect(pending.signal()?.aborted).toBe(true);
    expect(document.querySelector("dialog[open]")).toBeNull();
    fireEvent.click(page().getByRole("button", { name: "Buy" }));
    fireEvent.click(page().getByRole("button", { name: "1" }));
    expect(document.querySelector("[data-primary-amount]")?.textContent).toBe("$1");
    expect((page().getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  test("aborts a pending prepare on sign-out and resets before the next sign-in", () => {
    const pending = pendingPrepareClient("a");
    const view = renderTrade(pending.client);
    composeThirteen();
    fireEvent.click(page().getByRole("button", { name: "Continue" }));

    expect(page().getByRole("button", { name: "Preparing…" })).toBeTruthy();
    expect(pending.signal()?.aborted).toBe(false);

    rerenderTrade(view, createBlockedAccountWalletClient("unconfigured"));

    expect(pending.signal()?.aborted).toBe(true);
    expect(document.querySelector("dialog[open]")).toBeNull();
    rerenderTrade(view, verifiedAccountWalletClient({ owner: "b" }));
    fireEvent.click(page().getByRole("button", { name: "Buy" }));
    fireEvent.click(page().getByRole("button", { name: "1" }));
    expect(document.querySelector("[data-primary-amount]")?.textContent).toBe("$1");
    expect((page().getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled)
      .toBe(false);
  });
});

function pendingPrepareClient(owner: string) {
  let requestSignal: AbortSignal | undefined;
  const client: AccountWalletClient = {
    ...verifiedAccountWalletClient({ owner }),
    fetchAccountResource: (_path, options) => new Promise((_resolve, reject) => {
      requestSignal = options?.signal;
      requestSignal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    }),
  };
  return {
    client,
    signal: () => requestSignal,
  };
}
