import { describe, expect, test } from "bun:test";
import { homePanelHref, readHomeInboundPanelState } from "./panel-routing";

const inboundCases = [
  {
    search: "panel=balances",
    expected: { panel: "balances", account: null, addMoney: false, returnedFromCoinbase: false, sendFlow: false, actionId: null },
  },
  {
    search: "panel=activity&account=settings",
    expected: { panel: "activity", account: "settings", addMoney: false, returnedFromCoinbase: false, sendFlow: false, actionId: null },
  },
  {
    search: "return=coinbase",
    expected: { panel: "home", account: null, addMoney: true, returnedFromCoinbase: true, sendFlow: false, actionId: null },
  },
  {
    search: "flow=send&action=11111111-1111-4111-8111-111111111111",
    expected: { panel: "home", account: null, addMoney: false, returnedFromCoinbase: false, sendFlow: true, actionId: "11111111-1111-4111-8111-111111111111" },
  },
] as const;

describe("home panel routing", () => {
  for (const entry of inboundCases) {
    test(`parses ${entry.search}`, () => {
      expect(readHomeInboundPanelState(new URLSearchParams(entry.search))).toEqual(entry.expected);
    });
  }

  test("maps panels to shallow shell URLs", () => {
    expect(homePanelHref("/dashboard", "home")).toBe("/dashboard");
    expect(homePanelHref("/dashboard", "balances")).toBe("/dashboard?panel=balances");
    expect(homePanelHref("/", "invest")).toBe("/?panel=invest");
  });
});
