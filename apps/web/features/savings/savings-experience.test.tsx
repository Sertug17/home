import "@/features/account/dom-test-harness";

import { afterEach, describe, expect, test } from "bun:test";
import type { VerifiedAccountSession } from "@/features/account/session-types";
import type { MorphoVaultCandidate, MorphoVaultsResult } from "@/server/morpho/types";
import { MORPHO_V1_CANDIDATE_ADDRESSES } from "@/server/morpho/config";

const { act, cleanup, fireEvent, render, within } = await import("@testing-library/react");
const { SavingsExperience } = await import("./savings-experience");

const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";
const VAULT = MORPHO_V1_CANDIDATE_ADDRESSES[0];

const actionCandidate: MorphoVaultCandidate = {
  version: "v1",
  vaultAddress: VAULT,
  name: "Configured USDC vault",
  symbol: "USDC vault",
  listed: true,
  chainId: 8453,
  asset: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    decimals: 6,
  },
  curatorAddress: null,
  grossApy: 0.04,
  netApy: 0.035,
  feeRate: 0.1,
  totalAssetsRaw: "100000000",
  liquidityRaw: "50000000",
  stateAsOf: "2026-09-08T12:00:00.000Z",
  blockNumber: "51026404",
  source: {
    provider: "Morpho GraphQL",
    endpoint: "https://api.morpho.org/graphql",
    query: "vaults",
    fetchedAt: "2026-09-08T12:00:01.000Z",
  },
};

const initialData: MorphoVaultsResult = {
  version: "v1",
  chainId: 8453,
  asset: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    decimals: 6,
  },
  candidates: [],
  source: {
    provider: "Morpho GraphQL",
    endpoint: "https://api.morpho.org/graphql",
    query: "vaults",
    fetchedAt: "2026-09-07T20:30:00.000Z",
  },
  stale: false,
};

function session(address: typeof ADDRESS_A | typeof ADDRESS_B): VerifiedAccountSession {
  return {
    user: { subject: address === ADDRESS_A ? "subject-a" : "subject-b" },
    smartAccount: { address, chainId: 8453 },
    accountProvider: "cdp-embedded",
  };
}

function position(
  address: typeof ADDRESS_A | typeof ADDRESS_B,
  vaultAddress: string,
  assetsRaw: string | null,
) {
  return {
    version: "v1",
    accountAddress: address,
    vaultAddress,
    assetsRaw,
    sharesRaw: "1200000",
    indexedAt: "2026-09-07T20:30:01.000Z",
    source: {
      provider: "Morpho GraphQL",
      endpoint: "https://api.morpho.org/graphql",
      query: "vaultPosition",
      fetchedAt: "2026-09-07T20:30:02.000Z",
    },
    withdrawableRaw: null,
    withdrawableNote: "No maxWithdraw query was made.",
  };
}

function positions(address: typeof ADDRESS_A | typeof ADDRESS_B, assetsRaw: string | null) {
  return {
    accountAddress: address,
    fetchedAt: "2026-09-07T20:30:02.000Z",
    vaults: MORPHO_V1_CANDIDATE_ADDRESSES.map((vaultAddress, index) => ({
      vaultAddress,
      position: index === 0 && assetsRaw !== null
        ? position(address, vaultAddress, assetsRaw)
        : null,
    })),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(cleanup);

describe("authenticated savings positions UI", () => {
  test("mounts real configured savings actions instead of the disabled placeholders", async () => {
    render(
      <SavingsExperience
        initialData={{ ...initialData, candidates: [actionCandidate] }}
        session={session(ADDRESS_A)}
        fetchPositions={async () => positions(ADDRESS_A, null)}
        fetchAccountResource={async () => ({})}
      />,
    );

    await within(document.body).findByText(/No indexed position was found/);
    expect(within(document.body).queryByText("Deposit unavailable")).toBeNull();
    const deposit = within(document.body).getByRole("button", { name: "Review deposit" }) as HTMLButtonElement;
    expect(deposit.disabled).toBeTrue();
    fireEvent.change(within(document.body).getByLabelText("Vault"), {
      target: { value: VAULT },
    });
    expect(deposit.disabled).toBeFalse();
  });

  test("renders indexed assets and shares without claiming max withdraw", async () => {
    render(
      <SavingsExperience
        initialData={initialData}
        session={session(ADDRESS_A)}
        fetchPositions={async () => positions(ADDRESS_A, "123456789")}
      />,
    );

    expect(await within(document.body).findByText("123.456789 USDC")).toBeTruthy();
    expect(within(document.body).getByText("1,200,000")).toBeTruthy();
    expect(within(document.body).getByText("Share base units")).toBeTruthy();
    expect(within(document.body).getByText(/no maxWithdraw claim/i)).toBeTruthy();
  });

  test("distinguishes no indexed position from zero spendable balance", async () => {
    render(
      <SavingsExperience
        initialData={initialData}
        session={session(ADDRESS_A)}
        fetchPositions={async () => positions(ADDRESS_A, null)}
      />,
    );
    expect(await within(document.body).findByText(/No indexed position was found/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("0 USDC");
  });

  test("rejects empty, subset, and duplicate vault coverage instead of claiming all three are absent", async () => {
    const complete = positions(ADDRESS_A, null);
    const malformed = [
      { ...complete, vaults: [] },
      { ...complete, vaults: complete.vaults.slice(0, 2) },
      { ...complete, vaults: [complete.vaults[0], complete.vaults[0], complete.vaults[1]] },
    ];
    for (const payload of malformed) {
      render(
        <SavingsExperience
          initialData={initialData}
          session={session(ADDRESS_A)}
          fetchPositions={async () => payload}
        />,
      );
      expect(
        await within(document.body).findByText(/temporarily unavailable/),
      ).toBeTruthy();
      expect(document.body.textContent).not.toContain("No indexed position was found");
      cleanup();
    }
  });

  test("keeps nullable indexed assets unavailable without treating the position as absent", async () => {
    const payload = positions(ADDRESS_A, null);
    payload.vaults[0] = {
      vaultAddress: VAULT,
      position: position(ADDRESS_A, VAULT, null),
    };
    render(
      <SavingsExperience
        initialData={initialData}
        session={session(ADDRESS_A)}
        fetchPositions={async () => payload}
      />,
    );
    expect(await within(document.body).findByText("Unavailable")).toBeTruthy();
    expect(within(document.body).getByText("Share base units")).toBeTruthy();
    expect(document.body.textContent).not.toContain("No indexed position was found");
  });

  test("clears positions on account switch and ignores a late prior-wallet result", async () => {
    const pending = deferred<unknown>();
    const view = render(
      <SavingsExperience
        initialData={initialData}
        session={session(ADDRESS_A)}
        fetchPositions={async () => positions(ADDRESS_A, "99000000")}
      />,
    );
    await within(document.body).findByText("99 USDC");

    view.rerender(
      <SavingsExperience
        initialData={initialData}
        session={session(ADDRESS_B)}
        fetchPositions={() => pending.promise}
      />,
    );
    await within(document.body).findByText("Loading supported vault positions…");
    expect(within(document.body).queryByText("99 USDC")).toBeNull();

    view.rerender(<SavingsExperience initialData={initialData} session={null} fetchPositions={() => pending.promise} />);
    await act(async () => {
      pending.resolve(positions(ADDRESS_B, "2500000"));
      await pending.promise;
    });
    expect(within(document.body).queryByText("2.5 USDC")).toBeNull();
    expect(within(document.body).getByText(/Position unavailable until account verification/)).toBeTruthy();
  });
});
