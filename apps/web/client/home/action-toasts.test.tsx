import "../account/dom-test-harness";

import { afterEach, describe, expect, test } from "bun:test";
import type { VerifiedAccountSession } from "@/shared/account/session-types";
import { getHomeQueryClient, ownerQueryKey } from "@/client/query/query-client";
import { activityOwnerKey } from "@/client/activity/use-activity";
import type { ActionToastClock } from "./action-toasts";

const { act, cleanup, render, waitFor } = await import("@testing-library/react");
const { ActionToasts } = await import("./action-toasts");

const session: VerifiedAccountSession = {
  user: { subject: "toast-subject" },
  smartAccount: { address: "0x1111111111111111111111111111111111111111", chainId: 8453 },
  accountProvider: "cdp-embedded",
};
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  provider: "cdp-embedded",
  kind: "send",
  summary: {
    title: "Send USDC",
    amounts: [{ assetId: "usdc", symbol: "USDC", decimals: 6, amountBaseUnits: "1000000", direction: "spend" }],
    warnings: ["Recipient: 0x2222222222222222222222222222222222222222"],
    expiresAt: "2026-09-12T12:30:00.000Z",
  },
  status: "pending",
  createdAt: "2026-09-12T12:00:00.000Z",
  confirmedAt: "2026-09-12T12:01:00.000Z",
  owner: {
    subject: session.user.subject,
    address: session.smartAccount!.address,
    chainId: 8453,
    accountProvider: session.accountProvider,
  },
};

function fakeClock() {
  let id = 0;
  const timers = new Map<number, () => void>();
  const clock: ActionToastClock = {
    setTimer: (callback) => {
      const timerId = ++id;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimer: (timer) => { timers.delete(timer as number); },
  };
  return {
    clock,
    advance() {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) callback();
    },
  };
}

afterEach(() => {
  cleanup();
  getHomeQueryClient().clear();
});

describe("action toasts", () => {
  test("announces pending then confirmed actions and auto-dismisses both", async () => {
    const fake = fakeClock();
    const view = render(
      <ActionToasts
        session={session}
        fetchOperations={async () => ({ actions: [row] })}
        clock={fake.clock}
      />,
    );

    const region = view.container.querySelector('[aria-live="polite"]');
    expect(region).toBeTruthy();
    await waitFor(() => expect(view.getByText("Sending $1.00 to 0x2222…222222")).toBeTruthy());

    act(() => {
      getHomeQueryClient().setQueryData(
        ownerQueryKey(activityOwnerKey(session), "actions"),
        { actions: [{ ...row, status: "confirmed" }] },
      );
    });
    await waitFor(() => expect(view.getByText("Sent $1.00 to 0x2222…222222")).toBeTruthy());
    expect(view.getByText("Sending $1.00 to 0x2222…222222")).toBeTruthy();

    act(() => fake.advance());
    await waitFor(() => {
      expect(view.queryByText("Sending $1.00 to 0x2222…222222")).toBeNull();
      expect(view.queryByText("Sent $1.00 to 0x2222…222222")).toBeNull();
    });
  });
});
