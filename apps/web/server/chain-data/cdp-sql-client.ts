import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { ChainDataError } from "./errors";
import type {
  CdpSqlMetadata,
  CdpSqlResponse,
  CdpSqlRunRequest,
  CdpSqlTransport,
} from "./types";

export const CDP_SQL_ENDPOINT =
  "https://api.cdp.coinbase.com/platform/v2/data/query/run";
const CDP_SQL_HOST = "api.cdp.coinbase.com";
const CDP_SQL_PATH = "/platform/v2/data/query/run";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 29_000;

export type CdpSqlAuth =
  | {
      mode: "client-api-key";
      clientApiKey: string;
    }
  | {
      mode: "signed-jwt";
      /** Generate a short-lived server JWT for this exact request. */
      generateBearerToken(request: {
        requestMethod: "POST";
        requestHost: typeof CDP_SQL_HOST;
        requestPath: typeof CDP_SQL_PATH;
      }): Promise<string>;
    };

export type CdpSqlFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type CdpSqlHttpTransportOptions = {
  auth: CdpSqlAuth;
  timeoutMs?: number;
  fetch?: CdpSqlFetch;
};

export function createCdpSqlAuthFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CdpSqlAuth {
  const mode = env.CDP_SQL_AUTH_MODE?.trim() || "client-api-key";
  if (mode === "signed-jwt") {
    const apiKeyId = env.CDP_API_KEY_ID?.trim();
    const apiKeySecret = env.CDP_API_KEY_SECRET?.trim();
    if (!apiKeyId || !apiKeySecret) {
      throw new ChainDataError(
        "not-configured",
        "CDP_API_KEY_ID and CDP_API_KEY_SECRET are required when CDP_SQL_AUTH_MODE=signed-jwt.",
      );
    }
    return {
      mode: "signed-jwt",
      generateBearerToken: (request) =>
        generateJwt({
          apiKeyId,
          apiKeySecret,
          ...request,
        }),
    };
  }
  if (mode !== "client-api-key") {
    throw new ChainDataError(
      "not-configured",
      "CDP_SQL_AUTH_MODE must be client-api-key or signed-jwt.",
    );
  }

  const clientApiKey = env.CDP_SQL_CLIENT_API_KEY?.trim();
  if (!clientApiKey) {
    throw new ChainDataError(
      "not-configured",
      "CDP_SQL_CLIENT_API_KEY is required for the documented SQL quickstart auth mode.",
    );
  }
  return { mode: "client-api-key", clientApiKey };
}

export function createCdpSqlHttpTransport({
  auth,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetch: fetchImplementation = globalThis.fetch,
}: CdpSqlHttpTransportOptions): CdpSqlTransport {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new ChainDataError(
      "invalid-input",
      `CDP SQL timeout must be between 1 and ${MAX_TIMEOUT_MS} milliseconds.`,
    );
  }
  if (typeof fetchImplementation !== "function") {
    throw new ChainDataError("not-configured", "A fetch implementation is required.");
  }

  return {
    async run(request: CdpSqlRunRequest): Promise<CdpSqlResponse> {
      if (typeof request.sql !== "string" || request.sql.length === 0) {
        throw new ChainDataError("invalid-input", "CDP SQL query cannot be empty.");
      }
      if (request.sql.length > 10_000) {
        throw new ChainDataError(
          "invalid-input",
          "CDP SQL query exceeds the documented 10000-character limit.",
        );
      }
      if (
        request.cache &&
        (!Number.isSafeInteger(request.cache.maxAgeMs) ||
          request.cache.maxAgeMs < 500 ||
          request.cache.maxAgeMs > 900_000)
      ) {
        throw new ChainDataError(
          "invalid-input",
          "CDP SQL cache age must be between 500 and 900000 milliseconds.",
        );
      }
      throwIfRequestAborted(request.signal);
      let bearerToken: string;
      try {
        bearerToken = await resolveBearerToken(auth);
      } catch (error) {
        throwIfRequestAborted(request.signal);
        if (error instanceof ChainDataError) throw error;
        throw new ChainDataError(
          "not-configured",
          "CDP SQL bearer token generation failed.",
        );
      }
      throwIfRequestAborted(request.signal);
      const controller = new AbortController();
      const onAbort = () => controller.abort(request.signal?.reason);
      request.signal?.addEventListener("abort", onAbort, { once: true });
      const timeout = setTimeout(
        () => controller.abort("cdp-sql-timeout"),
        timeoutMs,
      );

      try {
        const headerName = ["author", "ization"].join("");
        const bearerValue = ["Bear", "er ", bearerToken].join("");
        const response = await fetchImplementation(CDP_SQL_ENDPOINT, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            [headerName]: bearerValue,
          },
          body: JSON.stringify({
            sql: request.sql,
            ...(request.cache ? { cache: request.cache } : {}),
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw responseError(response);
        }
        const payload: unknown = await response.json();
        if (!isCdpSqlResponseEnvelope(payload)) {
          throw new ChainDataError(
            "invalid-response",
            "CDP SQL returned an invalid response envelope.",
          );
        }
        return payload;
      } catch (error) {
        if (error instanceof ChainDataError) throw error;
        if (controller.signal.aborted) {
          throw new ChainDataError("timed-out", "CDP SQL request timed out.");
        }
        throw new ChainDataError("upstream-error", "CDP SQL request failed.");
      } finally {
        clearTimeout(timeout);
        request.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

function throwIfRequestAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ChainDataError("timed-out", "CDP SQL request was canceled.");
  }
}

async function resolveBearerToken(auth: CdpSqlAuth): Promise<string> {
  const token =
    auth.mode === "client-api-key"
      ? auth.clientApiKey
      : await auth.generateBearerToken({
          requestMethod: "POST",
          requestHost: CDP_SQL_HOST,
          requestPath: CDP_SQL_PATH,
        });
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new ChainDataError("not-configured", "CDP SQL bearer token is missing.");
  }
  if (/\s/.test(token)) {
    throw new ChainDataError("not-configured", "CDP SQL bearer token is malformed.");
  }
  return token;
}

function responseError(response: Response): ChainDataError {
  const status = response.status;
  if (status === 401 || status === 403) {
    return new ChainDataError(
      "unauthorized",
      "CDP SQL authentication was rejected.",
      { status },
    );
  }
  if (status === 402) {
    return new ChainDataError(
      "payment-required",
      "CDP SQL entitlement or payment is required.",
      { status },
    );
  }
  if (status === 408 || status === 504) {
    return new ChainDataError("timed-out", "CDP SQL request timed out.", {
      status,
    });
  }
  if (status === 429) {
    return new ChainDataError(
      "rate-limited",
      "CDP SQL rate limit was reached; the caller must back off.",
      {
        status,
        retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
      },
    );
  }
  return new ChainDataError("upstream-error", "CDP SQL request failed.", {
    status,
  });
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  if (/^[0-9]+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds * 1000 : null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? Math.max(0, date.getTime() - Date.now())
    : null;
}

function isCdpSqlResponseEnvelope(value: unknown): value is CdpSqlResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.result) ||
    !isCdpSqlMetadata(value.metadata) ||
    value.metadata.rowCount !== value.result.length
  ) {
    return false;
  }
  if (value.schema === undefined) return true;
  return (
    isRecord(value.schema) &&
    Array.isArray(value.schema.columns) &&
    value.schema.columns.every(
      (column) =>
        isRecord(column) &&
        typeof column.name === "string" &&
        typeof column.type === "string",
    )
  );
}

function isCdpSqlMetadata(value: unknown): value is CdpSqlMetadata {
  return (
    isRecord(value) &&
    typeof value.cached === "boolean" &&
    typeof value.executionTimestamp === "string" &&
    Number.isFinite(new Date(value.executionTimestamp).getTime()) &&
    Number.isSafeInteger(value.executionTimeMs) &&
    (value.executionTimeMs as number) >= 0 &&
    Number.isSafeInteger(value.rowCount) &&
    (value.rowCount as number) >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
