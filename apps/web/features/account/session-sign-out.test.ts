import { describe, expect, test } from "bun:test";
import {
  isSessionSuppressedForOwner,
  signOutWithSessionSuppressed,
} from "./session-sign-out";

const OWNER_KEY = "sdk-user-a";

describe("session sign-out suppression helpers", () => {
  test("suppresses the owner before attempting SDK sign-out and reports failure", async () => {
    const events: string[] = [];

    const result = await signOutWithSessionSuppressed({
      ownerKey: OWNER_KEY,
      suppress: (ownerKey) => events.push(`suppress:${ownerKey}`),
      signOut: async () => {
        events.push("sign-out");
        throw new Error("fixture failure");
      },
      onFailure: () => events.push("failure"),
    });

    expect(result).toBe(false);
    expect(events).toEqual([
      `suppress:${OWNER_KEY}`,
      "sign-out",
      "failure",
    ]);
    expect(isSessionSuppressedForOwner(OWNER_KEY, OWNER_KEY)).toBe(true);
    expect(isSessionSuppressedForOwner(OWNER_KEY, "sdk-user-b")).toBe(false);
  });

  test("returns success without invoking the failure callback", async () => {
    let failures = 0;

    const result = await signOutWithSessionSuppressed({
      ownerKey: OWNER_KEY,
      suppress: () => {},
      signOut: async () => {},
      onFailure: () => {
        failures += 1;
      },
    });

    expect(result).toBe(true);
    expect(failures).toBe(0);
  });
});
