import { describe, expect, test } from "bun:test";
import {
  getVisibleVerifiedSession,
  SessionValidationError,
  type VerifiedSessionOwner,
} from "./session-client";
import {
  isSessionSuppressedForOwner,
  signOutWithSessionSuppressed,
} from "./session-sign-out";

const OWNER_KEY = "sdk-user-a";
const VERIFIED_OWNER: VerifiedSessionOwner = {
  ownerKey: OWNER_KEY,
  session: {
    user: { subject: "cdp:test-subject" },
    smartAccount: {
      address: "0x1111111111111111111111111111111111111111",
      chainId: 8453,
    },
  },
};

describe("failed session sign-out recovery", () => {
  test("keeps a 401-rejected session hidden, bounds automatic work, and allows a user retry", async () => {
    let currentOwnerKey: string | null = OWNER_KEY;
    let suppressedOwnerKey: string | null = null;
    let validationCalls = 0;
    let signOutCalls = 0;
    let failureNotices = 0;

    async function runRejectedValidation() {
      validationCalls += 1;
      try {
        throw new SessionValidationError("unauthenticated");
      } catch (error) {
        if (
          !(error instanceof SessionValidationError) ||
          error.reason !== "unauthenticated"
        ) {
          throw error;
        }

        return signOutWithSessionSuppressed({
          ownerKey: OWNER_KEY,
          signOut: async () => {
            signOutCalls += 1;
            throw new Error("fixture sign-out failure");
          },
          suppress: (ownerKey) => {
            suppressedOwnerKey = ownerKey;
          },
          onFailure: () => {
            failureNotices += 1;
          },
        });
      }
    }

    expect(
      getVisibleVerifiedSession(VERIFIED_OWNER, currentOwnerKey, false),
    ).toEqual(VERIFIED_OWNER.session);

    const firstAttempt = await runRejectedValidation();
    const isSuppressedAfterFailure = isSessionSuppressedForOwner(
      suppressedOwnerKey,
      currentOwnerKey,
    );
    if (!isSuppressedAfterFailure) {
      await runRejectedValidation();
    }

    expect(firstAttempt).toBe(false);
    expect(signOutCalls).toBe(1);
    expect(validationCalls).toBe(1);
    expect(failureNotices).toBe(1);
    expect(
      getVisibleVerifiedSession(
        VERIFIED_OWNER,
        currentOwnerKey,
        isSuppressedAfterFailure,
      ),
    ).toBeNull();

    const retryAttempt = await signOutWithSessionSuppressed({
      ownerKey: OWNER_KEY,
      signOut: async () => {
        signOutCalls += 1;
        currentOwnerKey = null;
      },
      suppress: (ownerKey) => {
        suppressedOwnerKey = ownerKey;
      },
      onFailure: () => {
        failureNotices += 1;
      },
    });

    expect(retryAttempt).toBe(true);
    expect(signOutCalls).toBe(2);
    expect(failureNotices).toBe(1);
    expect(
      isSessionSuppressedForOwner(suppressedOwnerKey, currentOwnerKey),
    ).toBe(false);
    expect(
      getVisibleVerifiedSession(VERIFIED_OWNER, currentOwnerKey, false),
    ).toBeNull();
  });
});
