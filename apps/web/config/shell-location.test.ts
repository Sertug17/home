import { describe, expect, test } from "bun:test";
import {
  moneyFlowHref,
  parseInboundUrlIntent,
  parseShellLocation,
  shellHref,
  withoutMoneyFlowHref,
} from "./shell-location";

describe("shell location", () => {
  test("treats a bare dashboard path as Home with no overlays", () => {
    expect(parseShellLocation(new URLSearchParams())).toEqual({
      panel: "home",
      account: null,
      shelf: null,
      asset: null,
    });
    expect(shellHref("/dashboard")).toBe("/dashboard");
  });

  test("encodes shell panels and account settings", () => {
    const cases = [
      [{ panel: "save" as const }, "/dashboard?panel=save"],
      [{ panel: "balances" as const }, "/dashboard?panel=balances"],
      [{ panel: "activity" as const }, "/dashboard?panel=activity"],
      [{ panel: "invest" as const, shelf: "crypto" }, "/dashboard?panel=invest&shelf=crypto"],
      [{ panel: "invest" as const, asset: "cbbtc", shelf: "crypto" }, "/dashboard?panel=invest&shelf=crypto&asset=cbbtc"],
      [{ account: "settings" as const }, "/dashboard?account=settings"],
    ] as const;
    for (const [location, expected] of cases) {
      expect(shellHref("/dashboard", location)).toBe(expected);
    }
    expect(shellHref("/", { account: "signin" })).toBe("/?account=signin");
  });

  test("parses the allowed inbound intents through one schema", () => {
    expect(parseInboundUrlIntent(new URLSearchParams(
      "panel=invest&shelf=crypto&asset=cbbtc&return=coinbase&add-money=1&flow=send&action=11111111-1111-4111-8111-111111111111",
    ))).toEqual({
      kind: "inbound-url-intent",
      location: {
        panel: "invest",
        account: null,
        shelf: "crypto",
        asset: "cbbtc",
      },
      returnTo: "coinbase",
      addMoney: true,
      flow: "send",
      actionId: "11111111-1111-4111-8111-111111111111",
    });
  });

  test("ignores malformed or unknown inbound values", () => {
    expect(parseInboundUrlIntent({
      panel: "explore",
      account: "profile",
      shelf: "scams",
      asset: "javascript:alert(1)",
      return: "evil",
      "add-money": "yes",
      flow: "withdraw",
      action: "not-an-id",
    })).toEqual({
      kind: "inbound-url-intent",
      location: { panel: "home", account: null, shelf: null, asset: null },
      returnTo: null,
      addMoney: false,
      flow: null,
      actionId: null,
    });
  });

  test("ignores invest params unless the panel is Invest", () => {
    expect(parseShellLocation({ panel: "save", shelf: "crypto", asset: "cbbtc" }))
      .toEqual({ panel: "save", account: null, shelf: null, asset: null });
  });
});

describe("money flow location", () => {
  test("adds and removes only allowlisted flow state without URL payloads", () => {
    const balances = new URLSearchParams("panel=balances");
    expect(moneyFlowHref("/dashboard", null, balances)).toBe(
      "/dashboard?panel=balances&flow=send",
    );
    expect(moneyFlowHref("/dashboard", "11111111-1111-4111-8111-111111111111", balances))
      .toBe("/dashboard?panel=balances&flow=send&action=11111111-1111-4111-8111-111111111111");
    expect(withoutMoneyFlowHref(
      "/dashboard",
      new URLSearchParams("flow=send&action=11111111-1111-4111-8111-111111111111"),
    )).toBe("/dashboard");
  });
});
