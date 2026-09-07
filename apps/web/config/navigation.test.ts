import { describe, expect, test } from "bun:test";
import { isNavigationId, navigationItems } from "./navigation";

describe("primary navigation", () => {
  test("keeps the bounded Home, Save, Invest order", () => {
    expect(navigationItems.map((item) => item.label)).toEqual([
      "Home",
      "Save",
      "Invest",
    ]);
  });

  test("accepts only configured destinations", () => {
    expect(isNavigationId("home")).toBe(true);
    expect(isNavigationId("save")).toBe(true);
    expect(isNavigationId("invest")).toBe(true);
    expect(isNavigationId("explore")).toBe(false);
  });
});
