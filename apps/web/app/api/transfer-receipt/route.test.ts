import { describe, expect, test } from "bun:test";
import { GET, dynamic, runtime } from "./route";

const HASH = `0x${"ab".repeat(32)}`;

describe("GET /api/transfer-receipt route composition", () => {
  test("is Node-only, dynamic, and rejects unauthenticated receipt reads before RPC", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");

    const response = await GET(
      new Request(`http://127.0.0.1:3115/api/transfer-receipt?hash=${HASH}`),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("pragma")).toBe("no-cache");
  });
});
