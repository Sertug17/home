"use client";

import { useEffect, useState } from "react";
import { ActivityRow } from "@/components/finance-rows";
import { TransactionDetailsModal } from "@/components/transaction-details";
import type { VerifiedAccountSession } from "@/shared/account/session-types";
import { formatPresentationTokenAmount } from "@/shared/formatting";
import { labelForOperationStatus, presentOperationDetails, primaryOperationAmount } from "./operation-details";
import type { MoneyActionOperationStatus, PreparedMoneyAction } from "@/shared/money-actions/types";
import styles from "./recent-operations.module.css";

export type RecentMoneyActionOperation = {
  action: PreparedMoneyAction;
  status: MoneyActionOperationStatus;
  attemptCount: number;
  transactionHash?: `0x${string}`;
  userOperationHash?: `0x${string}`;
  createdAt: string;
  updatedAt: string;
};
export type FetchRecentMoneyActions = (signal?: AbortSignal) => Promise<unknown>;

export function RecentMoneyActions({
  session,
  fetchOperations,
  refreshTrigger,
  excludeTransactionHashes = [],
  embedded = false,
  showUnavailableNotice = true,
  onVisibleCountChange,
}: {
  session: VerifiedAccountSession | null;
  fetchOperations: FetchRecentMoneyActions;
  refreshTrigger?: string | number;
  excludeTransactionHashes?: Iterable<string>;
  embedded?: boolean;
  showUnavailableNotice?: boolean;
  onVisibleCountChange?: (count: number) => void;
}) {
  const ownerKey = session?.smartAccount ? `${session.user.subject}:${session.smartAccount.address}:${session.accountProvider}` : null;
  const [state, setState] = useState<{ ownerKey: string; operations: RecentMoneyActionOperation[]; unavailable: boolean } | null>(null);
  const [selected, setSelected] = useState<RecentMoneyActionOperation | null>(null);

  useEffect(() => {
    if (!session?.smartAccount || !ownerKey) return;
    const controller = new AbortController();
    void fetchOperations(controller.signal).then((value) => {
      if (!controller.signal.aborted) setState({ ownerKey, operations: parseRecentMoneyActions(value, session), unavailable: false });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ ownerKey, operations: [], unavailable: true });
    });
    return () => controller.abort();
  }, [fetchOperations, ownerKey, refreshTrigger, session]);

  const excluded = new Set(Array.from(excludeTransactionHashes, (hash) => hash.toLowerCase()));
  const operations = state?.ownerKey === ownerKey
    ? dedupeRecentMoneyActions(state.operations, excluded)
    : [];
  const unavailable = state?.ownerKey === ownerKey && state.unavailable;
  const visibleCount = operations.length + (unavailable && showUnavailableNotice ? 1 : 0);
  useEffect(() => onVisibleCountChange?.(visibleCount), [onVisibleCountChange, visibleCount]);
  if (operations.length === 0 && (!unavailable || !showUnavailableNotice)) return null;

  return <section className={styles.section} aria-labelledby={embedded ? undefined : "home-operations-title"}>
    {embedded ? null : <h3 id="home-operations-title">Home actions</h3>}
    {unavailable ? <p className={styles.message} role="status">Recorded Home actions are unavailable. Onchain transfers are still shown.</p> : <ol className={styles.list}>
      {operations.map((operation) => <OperationRow key={operation.action.id} operation={operation} onActivate={() => setSelected(operation)} />)}
    </ol>}
    <TransactionDetailsModal open={selected !== null} titleId="home-operation-details-title" details={selected ? presentOperationDetails(selected) : null} onClose={() => setSelected(null)} />
  </section>;
}

export function parseRecentMoneyActions(value: unknown, session: VerifiedAccountSession): RecentMoneyActionOperation[] {
  if (!session.smartAccount || !isRecord(value) || !Array.isArray(value.actions)) return [];
  const parsed: RecentMoneyActionOperation[] = [];
  for (const item of value.actions) {
    if (!isRecord(item) || !isRecord(item.owner) || !isRecord(item.summary)) continue;
    if (item.owner.subject !== session.user.subject || item.owner.accountProvider !== session.accountProvider ||
      typeof item.owner.address !== "string" || item.owner.address.toLowerCase() !== session.smartAccount.address.toLowerCase()) continue;
    if (typeof item.id !== "string" || typeof item.kind !== "string" || typeof item.status !== "string" ||
      typeof item.createdAt !== "string" || typeof item.confirmedAt !== "string" || typeof item.summary.title !== "string" ||
      !Array.isArray(item.summary.amounts) || !Array.isArray(item.summary.warnings) || typeof item.summary.expiresAt !== "string") continue;
    const status = item.status as MoneyActionOperationStatus;
    if (!["pending", "unknown", "confirmed", "failed"].includes(status)) continue;
    const action: PreparedMoneyAction = {
      id: item.id,
      owner: { subject: session.user.subject, address: session.smartAccount.address, chainId: 8453, accountProvider: session.accountProvider },
      kind: legacyKind(item.kind),
      title: item.summary.title,
      calls: [],
      amounts: item.summary.amounts as PreparedMoneyAction["amounts"],
      warnings: item.summary.warnings as string[],
      expiresAt: item.summary.expiresAt,
      ...(typeof item.summary.quoteId === "string" ? { quoteId: item.summary.quoteId } : {}),
      reviewHash: "",
      createdAt: item.createdAt,
    };
    parsed.push({ action, status, attemptCount: 1, createdAt: item.createdAt, updatedAt: item.confirmedAt,
      ...(typeof item.transactionHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(item.transactionHash) ? { transactionHash: item.transactionHash.toLowerCase() as `0x${string}` } : {}),
      ...(typeof item.providerHandle === "string" && /^0x[0-9a-fA-F]{64}$/.test(item.providerHandle) ? { userOperationHash: item.providerHandle.toLowerCase() as `0x${string}` } : {}),
    });
  }
  return parsed.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function dedupeRecentMoneyActions(operations: RecentMoneyActionOperation[], excluded: ReadonlySet<string>) {
  return operations.filter((operation) => !operation.transactionHash || !excluded.has(operation.transactionHash.toLowerCase()));
}

function OperationRow({ operation, onActivate }: { operation: RecentMoneyActionOperation; onActivate: () => void }) {
  const amount = primaryOperationAmount(operation);
  const status = labelForOperationStatus(operation.status);
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(operation.updatedAt));
  const value = amount ? `${amount.direction === "spend" ? "−" : "+"}${amount.estimated ? "~" : ""}${formatPresentationTokenAmount(amount.amountBaseUnits, amount.decimals, amount.symbol, { cashCurrency: amount.symbol === "USDC" ? "USD" : null })}` : status;
  return <ActivityRow icon={operation.status === "confirmed" ? "✓" : operation.status === "failed" ? "×" : operation.status === "unknown" ? "?" : "↑"} iconTone={operation.status === "failed" ? "outlined" : amount?.direction === "receive" ? "incoming" : "outgoing"} label={operation.action.title} context={<><time dateTime={operation.updatedAt}>{date}</time> · {status}</>} value={value} valueTone={operation.status === "failed" ? "error" : operation.status === "unknown" ? "muted" : "default"} onActivate={onActivate} activateLabel={`View ${operation.action.title} transaction details`} />;
}

function legacyKind(kind: string): PreparedMoneyAction["kind"] {
  if (kind === "savings-deposit") return "save-deposit";
  if (kind === "savings-withdraw") return "save-withdraw";
  if (kind === "trade") return "swap";
  return kind as PreparedMoneyAction["kind"];
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
