import { describe, expect, test } from "bun:test";
import { isNavigationId } from "./navigation";

describe("primary navigation", () => {
  test("accepts only configured tab destinations", () => {
    expect(isNavigationId("home")).toBe(true);
    expect(isNavigationId("invest")).toBe(true);
    expect(isNavigationId("save")).toBe(false);
    expect(isNavigationId("explore")).toBe(false);
  });


});
