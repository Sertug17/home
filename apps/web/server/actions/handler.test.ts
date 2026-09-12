import { describe, expect, test } from "bun:test";
import type { ActionRow } from "./store";
import { createConfirmActionHandler, createGetActionHandler } from "./handler";

const ID = "11111111-1111-4111-8111-111111111111";
const ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const CALL = { to: ADDRESS, data: "0x1234" as const, value: "0" };
const row: ActionRow = {
  id: ID,
  owner_key: "fixture",
  provider: "cdp-embedded",
  kind: "send",
  summary: { title: "Send USDC", amounts: [], warnings: [], expiresAt: "2026-09-12T12:30:00.000Z" },
  pending: { calls: [CALL] },
  created_at: "2026-09-12T12:00:00.000Z",
  confirmed_at: null,
  provider_handle: null,
  transaction_hash: null,
  handle_recorded_at: null,
};

function authorize(subject = "owner-a") {
  return async () => Response.json({
    user: { subject },
    smartAccount: { address: ADDRESS, chainId: 8453 },
    accountProvider: "cdp-embedded",
  });
}

function context() {
  return { params: Promise.resolve({ id: ID }) };
}

function request(path: string, init?: RequestInit) {
  return new Request(`https://home.test${path}`, {
    ...init,
    headers: { "X-Home-Account-Provider": "cdp-embedded", ...init?.headers },
  });
}

describe("actions HTTP handlers", () => {
  test("GET resumes an owner-scoped unconfirmed review without exposing pending metadata", async () => {
    const handler = createGetActionHandler({ authorize: authorize(), store: { get: async () => row } });
    const response = await handler(request(`/api/actions/${ID}`), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: ID,
      summary: row.summary,
      calls: [CALL],
      expiresAt: row.summary.expiresAt,
    });
  });

  test("GET returns a confirmed row with derived status", async () => {
    const confirmed = { ...row, pending: null, confirmed_at: "2026-09-12T12:05:00.000Z" };
    const handler = createGetActionHandler({
      authorize: authorize(),
      store: { get: async () => confirmed },
      now: () => new Date("2026-09-12T12:10:00.000Z"),
    });
    const response = await handler(request(`/api/actions/${ID}`), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: ID, status: "pending", summary: row.summary });
  });

  test("GET returns the same 404 for another owner", async () => {
    const handler = createGetActionHandler({ authorize: authorize("owner-b"), store: { get: async () => null } });
    const response = await handler(request(`/api/actions/${ID}`), context());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "ACTION_NOT_FOUND", message: "The action was not found." } });
  });

  test("confirm returns only the reviewed calls after the store clears pending", async () => {
    let confirmedCalls: unknown;
    const handler = createConfirmActionHandler({
      authorize: authorize(),
      now: () => new Date("2026-09-12T12:05:00.000Z"),
      store: {
        get: async () => row,
        confirm: async (_owner, _id, calls) => {
          confirmedCalls = calls;
          return { ...row, confirmed_at: "2026-09-12T12:05:00.000Z", pending: { calls: calls ?? [] } };
        },
      },
    });
    const response = await handler(request(`/api/actions/${ID}/confirm`, { method: "POST", body: "{}" }), context());
    expect(response.status).toBe(200);
    expect(confirmedCalls).toEqual([CALL]);
    expect((await response.json()).calls).toEqual([CALL]);
  });
});
