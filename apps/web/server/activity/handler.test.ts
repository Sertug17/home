import { describe, expect, test } from "bun:test";
import { ChainDataError } from "@/server/chain-data/errors";
import type { BaseErc20TransferPage } from "@/server/chain-data/types";
import { createActivityHandler } from "./handler";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER = "0x9999999999999999999999999999999999999999";

const page: BaseErc20TransferPage = {
  transfers: [],
  nextCursor: null,
  source: {
    provider: "cdp-sql",
    cached: false,
    stale: false,
    executionTimestamp: "2026-09-07T20:30:00.000Z",
    executionTimeMs: 4,
    fetchedAt: "2026-09-07T20:30:00.000Z",
  },
};

function authorized() {
  return Response.json({
    user: { subject: "verified-subject" },
    smartAccount: { address: ADDRESS, chainId: 8453 },
    accountProvider: "cdp-embedded",
  });
}

function request() {
  return new Request(`http://localhost/api/activity?wallet=${OTHER}`, {
    headers: { "X-Home-Account-Provider": "cdp-embedded" },
  });
}

function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("vary")).toBe("Authorization, X-Home-Account-Provider");
}

describe("authenticated activity handler", () => {
  test("uses only the server-verified smart account and returns private data", async () => {
    let received = "";
    const handler = createActivityHandler({
      authorize: async () => authorized(),
      readActivity: async (account) => {
        received = account.address;
        return page;
      },
    });

    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(received).toBe(ADDRESS);
    expect(received).not.toBe(OTHER);
    expectPrivate(response);
  });

  test("keeps missing SQL configuration actionable instead of returning fake empty activity", async () => {
    const handler = createActivityHandler({
      authorize: async () => authorized(),
      readActivity: async () => {
        throw new ChainDataError("not-configured", "fixture");
      },
    });

    const response = await handler(request());
    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(await response.json()).toEqual({
      error: {
        code: "ACTIVITY_NOT_CONFIGURED",
        message: "CDP SQL activity is not configured. Set CDP_SQL_AUTH_MODE and its required server credentials.",
      },
    });
  });

  test("rejects malformed successful auth responses before the reader", async () => {
    let reads = 0;
    const handler = createActivityHandler({
      authorize: async () => Response.json({ smartAccount: { address: OTHER } }),
      readActivity: async () => {
        reads += 1;
        return page;
      },
    });

    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(reads).toBe(0);
    expectPrivate(response);
  });
});
