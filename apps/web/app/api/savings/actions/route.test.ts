import { describe, expect, test } from "bun:test";
import { POST, dynamic, runtime } from "./route";

describe("POST /api/savings/actions route composition", () => {
  test("is dynamic, Node-only, and rejects unauthenticated preparation", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    const response = await POST(new Request("http://127.0.0.1:3122/api/savings/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "deposit",
        vaultAddress: "0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61",
        amountBaseUnits: "1000000",
      }),
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });
});
