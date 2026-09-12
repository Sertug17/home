import "@/client/account/dom-test-harness";

import { page } from "@/tests/helpers/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";
import type { InvestAsset } from "@/config/invest-assets";

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
  }),
}));

const { cleanup, render } = await import("@testing-library/react");
const {
  AccountWalletClientProvider,
  createBlockedAccountWalletClient,
} = await import("@/client/account/cdp-client");
const { InvestExperience } = await import("./invest-experience");

const dynamicId = "base:0x1111111111111111111111111111111111111111";
const dynamicAsset: InvestAsset = {
  id: dynamicId,
  category: "meme",
  displayName: "Higher",
  displaySymbol: "HIGHER",
  initials: "HI",
  chainId: 8453,
  contractAddress: "0x1111111111111111111111111111111111111111",
  availability: "informational",
  descriptor: "Trending on Base",
  representation: {
    tokenSymbol: "HIGHER",
    decimals: 18,
    relationship: "Base ERC-20 token.",
  },
  contractUrl:
    "https://basescan.org/token/0x1111111111111111111111111111111111111111",
};

const originalFetch = window.fetch;

function renderInvest(ui: ReactElement) {
  return render(
    <AccountWalletClientProvider
      client={createBlockedAccountWalletClient("unconfigured")}
    >
      {ui}
    </AccountWalletClientProvider>,
  );
}

const pendingHistoryFetch = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;

afterEach(() => {
  cleanup();
  window.fetch = originalFetch;
  window.history.replaceState({}, "", "/");
});

describe("dynamic Invest detail", () => {
  test("preserves a dynamic URL while the catalog loads, disappears, and reloads", () => {
    window.fetch = pendingHistoryFetch;
    const href = `/dashboard?panel=invest&asset=${encodeURIComponent(dynamicId)}`;
    window.history.replaceState({}, "", href);

    const view = renderInvest(
      <InvestExperience memeStatus="loading" memeAssets={[]} />,
    );
    expect(page().getByText("Loading asset details.")).toBeTruthy();
    expect(window.location.search).toContain(`asset=${encodeURIComponent(dynamicId)}`);
    expect(page().queryByRole("heading", { name: "Invest" })).toBeNull();

    view.rerender(
      <AccountWalletClientProvider
        client={createBlockedAccountWalletClient("unconfigured")}
      >
        <InvestExperience memeStatus="ready" memeAssets={[dynamicAsset]} />
      </AccountWalletClientProvider>,
    );
    expect(page().getByRole("heading", { name: "Higher" })).toBeTruthy();
    expect(page().getByText("USD")).toBeTruthy();

    view.rerender(
      <AccountWalletClientProvider
        client={createBlockedAccountWalletClient("unconfigured")}
      >
        <InvestExperience memeStatus="error" memeAssets={[]} />
      </AccountWalletClientProvider>,
    );
    expect(page().getByText("This Base asset is currently unavailable.")).toBeTruthy();
    expect(window.location.search).toContain(`asset=${encodeURIComponent(dynamicId)}`);

    cleanup();
    renderInvest(<InvestExperience memeStatus="ready" memeAssets={[dynamicAsset]} />);
    expect(page().getByRole("heading", { name: "Higher" })).toBeTruthy();
  });


});
