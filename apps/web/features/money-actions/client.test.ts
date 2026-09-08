import { describe, expect, test } from "bun:test";
import type { PreparedMoneyAction } from "./types";
import { claimMoneyAction } from "./client";

const action: PreparedMoneyAction = {
  id: "11111111-1111-4111-8111-111111111111",
  reviewHash: "a".repeat(64),
  owner: {
    subject: "subject-a",
    address: "0x1111111111111111111111111111111111111111",
    chainId: 8453,
    accountProvider: "cdp-embedded",
  },
  kind: "send",
  title: "Send ETH",
  calls: [{ to: "0x2222222222222222222222222222222222222222", data: "0x", value: "1" }],
  amounts: [{ assetId: "eth", symbol: "ETH", decimals: 18, amountBaseUnits: "1", direction: "spend" }],
  warnings: ["Network fee shown by wallet."],
  createdAt: "2026-09-08T05:00:00.000Z",
  expiresAt: "2026-09-08T05:10:00.000Z",
};

function response(canonical: PreparedMoneyAction) {
  return {
    action: canonical,
    disposition: "dispatch" as const,
    operation: {
      action: canonical,
      status: "submitting",
      attemptCount: 1,
      claimedAt: "2026-09-08T05:01:00.000Z",
      createdAt: action.createdAt,
      updatedAt: "2026-09-08T05:01:00.000Z",
    },
  };
}

describe("money action claim client", () => {
  test("rejects a canonical claim whose hash-covered plan differs from the reviewed plan", async () => {
    const changed = {
      ...action,
      calls: [{ ...action.calls[0], value: "2" }],
    };
    await expect(claimMoneyAction(async () => response(changed), action)).rejects.toMatchObject({
      reason: "invalid-response",
    });
  });

  test("returns the validated canonical action used for dispatch", async () => {
    await expect(claimMoneyAction(async () => response(action), action)).resolves.toMatchObject({
      action,
      disposition: "dispatch",
    });
  });

  test("compares transient calldata through its durable digest", async () => {
    const data = "0x1234" as const;
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data))),
      (byte) => byte.toString(16).padStart(2, "0")).join("");
    const sensitive = {
      ...action,
      sensitivePayload: true as const,
      calls: [{ ...action.calls[0], data, dataHash: digest }],
    };
    const safe = {
      ...sensitive,
      calls: [{ ...sensitive.calls[0], data: "0x" as const }],
    };
    await expect(claimMoneyAction(async () => response(safe), sensitive)).resolves.toMatchObject({
      action: safe,
    });

    const tampered = { ...sensitive, calls: [{ ...sensitive.calls[0], data: "0xabcd" as const }] };
    await expect(claimMoneyAction(async () => response(safe), tampered)).rejects.toMatchObject({
      reason: "invalid-response",
    });
  });
});
