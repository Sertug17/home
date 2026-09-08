import { describe, expect, test } from "bun:test";
import { createPortfolioValuationHandler } from "./valuation-handler";

const VERIFIED = "0x1111111111111111111111111111111111111111";
const ATTACKER = "0x9999999999999999999999999999999999999999";

function session() {
  return Response.json({
    user: { subject: "subject" },
    smartAccount: { address: VERIFIED, chainId: 8453 },
    accountProvider: "cdp-embedded",
  });
}

describe("portfolio valuation handler", () => {
  test("accepts only one validated region and uses only the verified session owner", async () => {
    const seen: Array<{ address: string; region: string }> = [];
    const handler = createPortfolioValuationHandler({
      authorize: async () => session(),
      readValuation: async (account, region) => {
        seen.push({ address: account.address, region });
        return { ok: true } as never;
      },
    });

    const invalid = await handler(
      new Request(`http://localhost/api/portfolio/valuation?region=ZZ&wallet=${ATTACKER}`),
    );
    expect(invalid.status).toBe(400);
    expect(seen).toEqual([]);

    const duplicate = await handler(
      new Request("http://localhost/api/portfolio/valuation?region=US&region=DE"),
    );
    expect(duplicate.status).toBe(400);

    const valid = await handler(
      new Request(`http://localhost/api/portfolio/valuation?region=DE&wallet=${ATTACKER}`),
    );
    expect(valid.status).toBe(200);
    expect(seen).toEqual([{ address: VERIFIED, region: "DE" }]);
    expect(valid.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(valid.headers.get("vary")).toBe(
      "Authorization, X-Home-Account-Provider",
    );
  });
});
