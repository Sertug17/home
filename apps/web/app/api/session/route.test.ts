import { describe, expect, test } from "bun:test";
import { GET, dynamic, runtime } from "./route";

describe("GET /api/session route composition", () => {
  test("uses the Node runtime, stays dynamic, and applies the session boundary", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");

    const response = await GET(new Request("http://127.0.0.1:3103/api/session"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "A valid access token is required.",
      },
    });
  });
});
