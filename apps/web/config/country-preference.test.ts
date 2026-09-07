import { describe, expect, test } from "bun:test";
import {
  anonymousCountryPreferenceKey,
  readAnonymousCountryPreference,
  writeAnonymousCountryPreference,
} from "./country-preference";

describe("anonymous country preference", () => {
  test("reads a supported persisted override", () => {
    const storage = { getItem: () => "br" };

    expect(readAnonymousCountryPreference(() => storage)).toBe("BR");
  });

  test("rejects an unknown persisted value", () => {
    const storage = { getItem: () => "FR" };

    expect(readAnonymousCountryPreference(() => storage)).toBeNull();
  });

  test("writes the explicit selection using the versioned key", () => {
    const writes: Array<[string, string]> = [];
    const storage = {
      setItem: (key: string, value: string) => writes.push([key, value]),
    };

    expect(writeAnonymousCountryPreference(() => storage, "ID")).toBe(true);
    expect(writes).toEqual([[anonymousCountryPreferenceKey, "ID"]]);
  });

  test("fails closed when storage methods are unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readAnonymousCountryPreference(() => storage)).toBeNull();
    expect(writeAnonymousCountryPreference(() => storage, "US")).toBe(false);
  });

  test("fails closed when acquiring storage throws", () => {
    const getStorage = () => {
      throw new DOMException("Storage access blocked by policy", "SecurityError");
    };

    expect(readAnonymousCountryPreference(getStorage)).toBeNull();
    expect(writeAnonymousCountryPreference(getStorage, "US")).toBe(false);
  });
});
