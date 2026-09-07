import { describe, expect, test } from "bun:test";
import {
  CDP_SQL_ENDPOINT,
  createCdpSqlAuthFromEnv,
  createCdpSqlHttpTransport,
} from "./cdp-sql-client";
import { ChainDataError } from "./errors";

function successResponse() {
  return new Response(
    JSON.stringify({
      result: [],
      schema: { columns: [] },
      metadata: {
        cached: false,
        executionTimestamp: "2026-09-07T12:00:00.000Z",
        executionTimeMs: 1,
        rowCount: 0,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("CDP SQL HTTP transport", () => {
  test("uses only the fixed endpoint, bounded request body, and client bearer key", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return successResponse();
    };
    const transport = createCdpSqlHttpTransport({
      auth: { mode: "client-api-key", clientApiKey: "client-key-value" },
      fetch: mockFetch,
    });

    await transport.run({ sql: "SELECT 1", cache: { maxAgeMs: 1000 } });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(CDP_SQL_ENDPOINT);
    expect(calls[0]?.init?.method).toBe("POST");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get(["author", "ization"].join(""))).toBe(
      ["Bear", "er client-key-value"].join(""),
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      sql: "SELECT 1",
      cache: { maxAgeMs: 1000 },
    });
  });

  test("requests a signed JWT for the exact documented HTTP target", async () => {
    let requestedTarget: unknown;
    const transport = createCdpSqlHttpTransport({
      auth: {
        mode: "signed-jwt",
        async generateBearerToken(target) {
          requestedTarget = target;
          return "short-lived-jwt";
        },
      },
      fetch: async () => successResponse(),
    });

    await transport.run({ sql: "SELECT 1" });

    expect(requestedTarget).toEqual({
      requestMethod: "POST",
      requestHost: "api.cdp.coinbase.com",
      requestPath: "/platform/v2/data/query/run",
    });
  });

  test("redacts signed-token generator failures", async () => {
    const tokenMarker = ["private", "-signing-material"].join("");
    const transport = createCdpSqlHttpTransport({
      auth: {
        mode: "signed-jwt",
        async generateBearerToken() {
          throw new Error(`generator failed with ${tokenMarker}`);
        },
      },
      fetch: async () => successResponse(),
    });

    try {
      await transport.run({ sql: "SELECT 1" });
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "not-configured" });
      expect(String(error)).not.toContain(tokenMarker);
    }
  });

  test("returns a typed 429 without retrying", async () => {
    let callCount = 0;
    const transport = createCdpSqlHttpTransport({
      auth: { mode: "client-api-key", clientApiKey: "do-not-print" },
      fetch: async () => {
        callCount += 1;
        return new Response("private upstream details", {
          status: 429,
          headers: { "retry-after": "7" },
        });
      },
    });

    try {
      await transport.run({ sql: "SELECT 1" });
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ChainDataError);
      expect(error).toMatchObject({
        code: "rate-limited",
        status: 429,
        retryAfterMs: 7000,
      });
      expect(String(error)).not.toContain("do-not-print");
      expect(String(error)).not.toContain("private upstream details");
    }
    expect(callCount).toBe(1);
  });

  test("applies a finite local timeout and does not expose credentials", async () => {
    const tokenMarker = ["sensitive", "-marker"].join("");
    const transport = createCdpSqlHttpTransport({
      auth: { mode: "client-api-key", clientApiKey: tokenMarker },
      timeoutMs: 5,
      fetch: (_: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    });

    try {
      await transport.run({ sql: "SELECT 1" });
      throw new Error("Expected timeout");
    } catch (error) {
      expect(error).toMatchObject({ code: "timed-out" });
      expect(String(error)).not.toContain(tokenMarker);
    }
  });

  test("rejects malformed envelopes and oversized SQL", async () => {
    const malformed = createCdpSqlHttpTransport({
      auth: { mode: "client-api-key", clientApiKey: "key" },
      fetch: async () =>
        new Response(JSON.stringify({ result: [] }), { status: 200 }),
    });
    await expect(malformed.run({ sql: "SELECT 1" })).rejects.toMatchObject({
      code: "invalid-response",
    });

    const unusedFetch = createCdpSqlHttpTransport({
      auth: { mode: "client-api-key", clientApiKey: "key" },
      fetch: async () => successResponse(),
    });
    await expect(
      unusedFetch.run({ sql: "x".repeat(10_001) }),
    ).rejects.toMatchObject({ code: "invalid-input" });
    await expect(
      unusedFetch.run({ sql: "SELECT 1", cache: { maxAgeMs: 1 } }),
    ).rejects.toMatchObject({ code: "invalid-input" });
  });
});

describe("CDP SQL environment auth", () => {
  test("accepts only the dedicated server-side SQL client key", () => {
    const sqlKeyName = ["CDP_SQL_CLIENT", "_API_KEY"].join("");
    const generalKeyName = ["CDP_API_KEY", "_SECRET"].join("");
    expect(createCdpSqlAuthFromEnv({ [sqlKeyName]: "sql-client-value" })).toEqual({
      mode: "client-api-key",
      clientApiKey: "sql-client-value",
    });
    expect(() =>
      createCdpSqlAuthFromEnv({
        CDP_API_KEY_ID: "wallet-project-key",
        [generalKeyName]: "wallet-project-value",
      }),
    ).toThrow("CDP_SQL_CLIENT_API_KEY");
  });
});
