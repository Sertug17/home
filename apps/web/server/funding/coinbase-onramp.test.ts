import { describe, expect, test } from "bun:test";
import { createCoinbaseOnrampClient, CoinbaseOnrampError } from "./coinbase-onramp";

const ADDRESS = "0x1111111111111111111111111111111111111111" as const;

describe("Coinbase hosted Onramp client", () => {
  test("uses the installed CDP JWT helper contract and binds canonical USDC on Base", async () => {
    const jwtOptions: unknown[] = [];
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    const client = createCoinbaseOnrampClient({
      env: { CDP_API_KEY_ID: "key-id", CDP_API_KEY_SECRET: "key-secret" },
      generateJwtImplementation: async (options) => {
        jwtOptions.push(options);
        return "signed-jwt";
      },
      fetchImplementation: async (input, init) => {
        requests.push({ input: String(input), init });
        return Response.json({
          session: {
            onrampUrl: "https://pay.coinbase.com/buy?sessionToken=short-lived",
          },
        });
      },
    });

    const result = await client({
      address: ADDRESS,
      redirectUrl: "https://home.example/fund?return=coinbase",
    });

    expect(jwtOptions).toEqual([
      {
        apiKeyId: "key-id",
        apiKeySecret: "key-secret",
        requestMethod: "POST",
        requestHost: "api.cdp.coinbase.com",
        requestPath: "/platform/v2/onramp/sessions",
        expiresIn: 120,
      },
    ]);
    expect(requests[0]?.input).toBe("https://api.cdp.coinbase.com/platform/v2/onramp/sessions");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      purchaseCurrency: "USDC",
      destinationNetwork: "base",
      destinationAddress: ADDRESS,
      redirectUrl: "https://home.example/fund?return=coinbase",
    });
    expect(result.network).toEqual({ name: "Base", chainId: 8453 });
  });

  test("fails closed for missing existing credentials and non-Coinbase provider URLs", async () => {
    const missing = createCoinbaseOnrampClient({ env: {} });
    await expect(
      missing({ address: ADDRESS, redirectUrl: "https://home.example/fund?return=coinbase" }),
    ).rejects.toMatchObject({ code: "not-configured" });

    const invalid = createCoinbaseOnrampClient({
      env: { CDP_API_KEY_ID: "key-id", CDP_API_KEY_SECRET: "key-secret" },
      generateJwtImplementation: async () => "signed-jwt",
      fetchImplementation: async () =>
        Response.json({
          session: { onrampUrl: "https://evil.example/buy?sessionToken=leak" },
        }),
    });
    await expect(
      invalid({ address: ADDRESS, redirectUrl: "https://home.example/fund?return=coinbase" }),
    ).rejects.toBeInstanceOf(CoinbaseOnrampError);
  });
});
