"use client";

import { useEffect, useState } from "react";
import type { VerifiedAccountSession } from "@/features/account/session-types";
import type { BaseErc20TransferPage } from "@/server/chain-data/types";

export type ActivityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; page: BaseErc20TransferPage }
  | { status: "not-configured" }
  | { status: "error" };

export function useActivity(
  session: VerifiedAccountSession | null,
  fetchActivity: (signal?: AbortSignal) => Promise<unknown>,
): ActivityState {
  const [result, setResult] = useState<{
    key: string;
    state: ActivityState;
  } | null>(null);
  const sessionAddress = session?.smartAccount?.address ?? null;
  const key = session && sessionAddress
    ? `${session.user.subject}:${session.accountProvider}:${sessionAddress}`
    : null;

  useEffect(() => {
    if (!key) return;

    const controller = new AbortController();
    void fetchActivity(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        const page = parseActivityPage(value, sessionAddress!);
        setResult({
          key,
          state: page ? { status: "ready", page } : { status: "error" },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          state:
            errorCode(error) === "ACTIVITY_NOT_CONFIGURED"
              ? { status: "not-configured" }
              : { status: "error" },
        });
      });

    return () => controller.abort();
  }, [fetchActivity, key, sessionAddress]);

  if (!key) return { status: "idle" };
  return result?.key === key ? result.state : { status: "loading" };
}

export function ActivityList({ state }: { state: ActivityState }) {
  if (state.status === "idle") {
    return <p className="empty-activity">Activity remains private until verification.</p>;
  }
  if (state.status === "loading") {
    return <p className="empty-activity" role="status">Loading supported USDC activity…</p>;
  }
  if (state.status === "not-configured") {
    return (
      <p className="empty-activity" role="alert">
        Activity is unavailable because CDP SQL server authentication is not configured.
      </p>
    );
  }
  if (state.status === "error") {
    return <p className="empty-activity" role="alert">Supported USDC activity is temporarily unavailable.</p>;
  }
  if (state.page.transfers.length === 0) {
    return <p className="empty-activity">No indexed USDC transfers in the last 30 days.</p>;
  }

  return (
    <>
      <ul className="activity-list" aria-label="Supported USDC activity">
        {state.page.transfers.map((transfer) => (
          <li key={transfer.id}>
            <span>
              <strong>{activityLabel(transfer.direction)}</strong>
              <small>{formatTimestamp(transfer.blockTimestamp)}</small>
            </span>
            <span>
              <strong>{formatUsdc(transfer.amountBaseUnits)}</strong>
              <small>USDC on Base</small>
            </span>
          </li>
        ))}
      </ul>
      <p className="activity-source">
        {state.page.source.stale ? "Stale CDP index" : "CDP index"} · As of {formatTimestamp(state.page.source.executionTimestamp)} · USDC transfers only
      </p>
    </>
  );
}

function parseActivityPage(
  value: unknown,
  expectedAddress: `0x${string}`,
): BaseErc20TransferPage | null {
  if (!isRecord(value) || !Array.isArray(value.transfers) || !isRecord(value.source)) {
    return null;
  }
  const transfers = value.transfers;
  if (!transfers.every((transfer) => isTransfer(transfer, expectedAddress))) return null;
  if (
    typeof value.source.stale !== "boolean" ||
    typeof value.source.cached !== "boolean" ||
    typeof value.source.executionTimestamp !== "string" ||
    typeof value.source.fetchedAt !== "string"
  ) {
    return null;
  }
  return value as unknown as BaseErc20TransferPage;
}

function isTransfer(value: unknown, expectedAddress: `0x${string}`) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.walletAddress === "string" &&
    value.walletAddress.toLowerCase() === expectedAddress.toLowerCase() &&
    value.assetId === "usdc" &&
    (value.direction === "incoming" ||
      value.direction === "outgoing" ||
      value.direction === "self") &&
    typeof value.amountBaseUnits === "string" &&
    /^(0|[1-9][0-9]*)$/.test(value.amountBaseUnits) &&
    typeof value.blockTimestamp === "string"
  );
}

function activityLabel(direction: "incoming" | "outgoing" | "self") {
  if (direction === "incoming") return "Received";
  if (direction === "outgoing") return "Sent";
  return "Self transfer";
}

function formatUsdc(raw: string) {
  const padded = raw.padStart(7, "0");
  const whole = padded.slice(0, -6);
  const fraction = padded.slice(-6).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} USDC`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function errorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
