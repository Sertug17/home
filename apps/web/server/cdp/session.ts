export const BASE_CHAIN_ID = 8453 as const;

export type SessionPayload = {
  user: {
    subject: string;
  };
  smartAccount: {
    address: string;
    chainId: typeof BASE_CHAIN_ID;
  } | null;
};

export type VerifiedEndUser = {
  userId: unknown;
  evmSmartAccountObjects: unknown;
};

export interface AccessTokenValidator {
  validateAccessToken(accessToken: string): Promise<unknown>;
}

export class InvalidAccessTokenError extends Error {
  constructor() {
    super("The CDP access token is invalid or expired.");
    this.name = "InvalidAccessTokenError";
  }
}

export class AuthUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("CDP authentication is unavailable.", { cause });
    this.name = "AuthUnavailableError";
  }
}

class InvalidVerifiedIdentityError extends Error {
  constructor() {
    super("CDP returned an invalid verified identity.");
    this.name = "InvalidVerifiedIdentityError";
  }
}

const compactJwtPattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
const evmAddressPattern = /^0x[0-9a-fA-F]{40}$/;
const subjectPattern = /^[a-zA-Z0-9-]{1,100}$/;

function normalizeVerifiedEndUser(value: unknown): SessionPayload {
  if (!value || typeof value !== "object") {
    throw new InvalidVerifiedIdentityError();
  }

  const endUser = value as VerifiedEndUser;

  if (typeof endUser.userId !== "string" || !subjectPattern.test(endUser.userId)) {
    throw new InvalidVerifiedIdentityError();
  }

  if (!Array.isArray(endUser.evmSmartAccountObjects)) {
    throw new InvalidVerifiedIdentityError();
  }

  const smartAccounts = endUser.evmSmartAccountObjects.map((account) => {
    if (!account || typeof account !== "object" || !("address" in account)) {
      throw new InvalidVerifiedIdentityError();
    }

    const address = account.address;

    if (typeof address !== "string" || !evmAddressPattern.test(address)) {
      throw new InvalidVerifiedIdentityError();
    }

    return address.toLowerCase();
  });

  return {
    user: {
      subject: endUser.userId,
    },
    smartAccount: smartAccounts[0]
      ? {
          address: smartAccounts[0],
          chainId: BASE_CHAIN_ID,
        }
      : null,
  };
}

export type SessionHandlerDependencies = {
  getValidator: () => Promise<AccessTokenValidator>;
};

const privateResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Authorization",
} as const;

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: privateResponseHeaders,
  });
}

function unauthenticatedResponse(): Response {
  return jsonResponse(
    {
      error: {
        code: "UNAUTHENTICATED",
        message: "A valid access token is required.",
      },
    },
    401,
  );
}

function authUnavailableResponse(): Response {
  return jsonResponse(
    {
      error: {
        code: "AUTH_UNAVAILABLE",
        message: "Authentication is temporarily unavailable.",
      },
    },
    503,
  );
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const match = /^Bearer[\t ]+([^\s,]+)$/i.exec(authorization);
  const token = match?.[1];

  if (!token || token.length > 8192 || !compactJwtPattern.test(token)) {
    return null;
  }

  return token;
}

export function createSessionHandler({ getValidator }: SessionHandlerDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const accessToken = readBearerToken(request);

    if (!accessToken) {
      return unauthenticatedResponse();
    }

    try {
      const validator = await getValidator();
      const verifiedEndUser = await validator.validateAccessToken(accessToken);
      const session = normalizeVerifiedEndUser(verifiedEndUser);

      return jsonResponse(session, 200);
    } catch (error) {
      if (error instanceof InvalidAccessTokenError) {
        return unauthenticatedResponse();
      }

      return authUnavailableResponse();
    }
  };
}
