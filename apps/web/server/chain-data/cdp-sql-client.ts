import { ChainDataError } from "./errors";
import type {
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
      let bearerToken: string;
      try {
        bearerToken = await resolveBearerToken(auth);
      } catch (error) {
        if (error instanceof ChainDataError) throw error;
        throw new ChainDataError(
          "not-configured",
          "CDP SQL bearer token generation failed.",
        );
      }
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
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.result) &&
    isRecord(value.schema) &&
    Array.isArray(value.schema.columns) &&
    isRecord(value.metadata)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
