import { describe, expect, test } from "bun:test";
import {
  AuthUnavailableError,
  InvalidAccessTokenError,
  createSessionHandler,
  type AccessTokenValidator,
} from "./session";

const requestUrl = "http://127.0.0.1:3103/api/session";
const smartAccountAddress = "0xAbCdEf0123456789aBCdef0123456789abCDef01";

function makeRequest(authorization?: string): Request {
  return new Request(requestUrl, {
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

function makeHandler(
  validateAccessToken: AccessTokenValidator["validateAccessToken"],
  getValidator: () => Promise<AccessTokenValidator> = async () => ({ validateAccessToken }),
) {
  return createSessionHandler({ getValidator });
}

async function expectPrivateJson(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("vary")).toBe("Authorization");
  expect(await response.json()).toEqual(body);
}

const unauthenticatedBody = {
  error: {
    code: "UNAUTHENTICATED",
    message: "A valid access token is required.",
  },
};

const unavailableBody = {
  error: {
    code: "AUTH_UNAVAILABLE",
    message: "Authentication is temporarily unavailable.",
  },
};

describe("GET /api/session handler", () => {
  test("rejects missing and malformed authorization headers before provider access", async () => {
    let calls = 0;
    const handler = makeHandler(async () => {
      calls += 1;
      return {};
    });

    for (const request of [
      makeRequest(),
      makeRequest("Basic abc"),
      makeRequest("Bearer"),
      makeRequest("Bearer token,other"),
      makeRequest("Bearer token with-space"),
      makeRequest("Bearer not-a-compact-jwt"),
    ]) {
      await expectPrivateJson(await handler(request), 401, unauthenticatedBody);
    }

    expect(calls).toBe(0);
  });

  test("passes only the bearer token to validation", async () => {
    let receivedToken: string | undefined;
    const handler = makeHandler(async (accessToken) => {
      receivedToken = accessToken;
      return {
        userId: "cdp-user-123",
        evmSmartAccountObjects: [],
      };
    });

    const response = await handler(makeRequest("bEaReR\tverified.token.value"));

    expect(response.status).toBe(200);
    expect(receivedToken).toBe("verified.token.value");
  });

  test("maps invalid and expired provider tokens to 401", async () => {
    for (const error of [new InvalidAccessTokenError(), new InvalidAccessTokenError()]) {
      const handler = makeHandler(async () => {
        throw error;
      });

      await expectPrivateJson(
        await handler(makeRequest("Bearer expired.token.value")),
        401,
        unauthenticatedBody,
      );
    }
  });

  test("returns only verified identity and the first verified smart account", async () => {
    const handler = makeHandler(async () => ({
      userId: "cdp-user-123",
      authenticationMethods: [{ type: "email", email: "private@example.com" }],
      evmAccounts: ["0x1111111111111111111111111111111111111111"],
      evmAccountObjects: [
        {
          address: "0x1111111111111111111111111111111111111111",
          createdAt: "2026-09-07T00:00:00Z",
        },
      ],
      evmSmartAccountObjects: [
        {
          address: smartAccountAddress,
          ownerAddresses: ["0x1111111111111111111111111111111111111111"],
          createdAt: "2026-09-07T00:00:00Z",
        },
        {
          address: "0x2222222222222222222222222222222222222222",
          ownerAddresses: ["0x3333333333333333333333333333333333333333"],
          createdAt: "2026-09-07T00:00:01Z",
        },
      ],
      providerInternalField: "must-not-leak",
    }));

    await expectPrivateJson(await handler(makeRequest("Bearer valid.token.value")), 200, {
      user: { subject: "cdp-user-123" },
      smartAccount: {
        address: smartAccountAddress.toLowerCase(),
        chainId: 8453,
      },
    });
  });

  test("returns null when the verified identity has no smart account and never uses the EOA", async () => {
    const handler = makeHandler(async () => ({
      userId: "cdp-user-without-smart-account",
      evmAccounts: ["0x1111111111111111111111111111111111111111"],
      evmAccountObjects: [
        {
          address: "0x1111111111111111111111111111111111111111",
          createdAt: "2026-09-07T00:00:00Z",
        },
      ],
      evmSmartAccountObjects: [],
    }));

    await expectPrivateJson(await handler(makeRequest("Bearer valid.token.value")), 200, {
      user: { subject: "cdp-user-without-smart-account" },
      smartAccount: null,
    });
  });

  test("fails closed when provider configuration or transport is unavailable", async () => {
    const missingConfigHandler = makeHandler(
      async () => ({}),
      async () => {
        throw new AuthUnavailableError();
      },
    );
    const providerFailureHandler = makeHandler(async () => {
      throw new AuthUnavailableError(new Error("provider payload with sensitive details"));
    });

    await expectPrivateJson(
      await missingConfigHandler(makeRequest("Bearer valid.token.value")),
      503,
      unavailableBody,
    );
    await expectPrivateJson(
      await providerFailureHandler(makeRequest("Bearer valid.token.value")),
      503,
      unavailableBody,
    );
  });

  test("fails closed on malformed verified provider identity data", async () => {
    for (const providerValue of [
      null,
      { userId: "bad subject!", evmSmartAccountObjects: [] },
      { userId: "cdp-user", evmSmartAccountObjects: [{ address: "not-an-address" }] },
      { userId: "cdp-user", evmSmartAccountObjects: undefined },
    ]) {
      const handler = makeHandler(async () => providerValue);
      await expectPrivateJson(
        await handler(makeRequest("Bearer valid.token.value")),
        503,
        unavailableBody,
      );
    }
  });
});
