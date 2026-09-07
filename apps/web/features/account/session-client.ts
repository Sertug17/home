export const BASE_CHAIN_ID = 8453;

export type VerifiedAccountSession = {
  user: {
    subject: string;
  };
  smartAccount: {
    address: `0x${string}`;
    chainId: typeof BASE_CHAIN_ID;
  } | null;
};

export type SessionValidationFailure =
  | "unauthenticated"
  | "unavailable"
  | "invalid-response";

export class SessionValidationError extends Error {
  readonly reason: SessionValidationFailure;

  constructor(reason: SessionValidationFailure) {
    super(reason);
    this.name = "SessionValidationError";
    this.reason = reason;
  }
}

export type VerifiedSessionOwner = {
  ownerKey: string;
  session: VerifiedAccountSession;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSession(value: unknown): VerifiedAccountSession | null {
  if (!isRecord(value) || !isRecord(value.user)) {
    return null;
  }

  const subject = value.user.subject;
  if (typeof subject !== "string" || subject.trim().length === 0) {
    return null;
  }

  if (value.smartAccount === null) {
    return {
      user: { subject },
      smartAccount: null,
    };
  }

  if (!isRecord(value.smartAccount)) {
    return null;
  }

  const { address, chainId } = value.smartAccount;
  if (
    typeof address !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(address) ||
    chainId !== BASE_CHAIN_ID
  ) {
    return null;
  }

  return {
    user: { subject },
    smartAccount: {
      address: address as `0x${string}`,
      chainId: BASE_CHAIN_ID,
    },
  };
}

export function normalizeProjectId(value: string | undefined): string | null {
  const projectId = value?.trim();
  return projectId ? projectId : null;
}

export function getVisibleVerifiedSession(
  verified: VerifiedSessionOwner | null,
  currentOwnerKey: string | null,
  isSigningOut: boolean,
): VerifiedAccountSession | null {
  if (isSigningOut || !verified || verified.ownerKey !== currentOwnerKey) {
    return null;
  }

  return verified.session;
}

export type SessionFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function validateAccountSession(
  accessToken: string,
  signal?: AbortSignal,
  fetchImplementation: SessionFetch = fetch,
): Promise<VerifiedAccountSession> {
  if (!accessToken.trim()) {
    throw new SessionValidationError("unauthenticated");
  }

  let response: Response;
  try {
    response = await fetchImplementation("/api/session", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    throw new SessionValidationError("unavailable");
  }

  if (response.status === 401) {
    throw new SessionValidationError("unauthenticated");
  }

  if (!response.ok) {
    throw new SessionValidationError("unavailable");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SessionValidationError("invalid-response");
  }

  const session = parseSession(payload);
  if (!session) {
    throw new SessionValidationError("invalid-response");
  }

  return session;
}
