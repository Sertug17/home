"use client";

import { useState } from "react";
import { useAccountWallet } from "@/client/account/cdp-client";
import { formatBaseUnitAmount } from "@/client/portfolio";
import { decodeMoneyActionApproval } from "@/shared/money-actions/approval";
import { useReactiveExpiry } from "./expiry";
import type { OperationResult, PreparedMoneyAction } from "@/shared/money-actions/types";
import styles from "./review.module.css";

export type MoneyActionReviewProps = {
  action: PreparedMoneyAction;
  onClose: () => void;
  onConfirmed: (result: OperationResult) => void;
  execute?: (action: PreparedMoneyAction) => Promise<OperationResult>;
};

export function MoneyActionReview(props: MoneyActionReviewProps) {
  return props.execute
    ? <MoneyActionReviewContent {...props} execute={props.execute} />
    : <ConnectedMoneyActionReview {...props} />;
}

function ConnectedMoneyActionReview(props: MoneyActionReviewProps) {
  const wallet = useAccountWallet();
  return <MoneyActionReviewContent {...props} execute={wallet.executeMoneyAction} />;
}

function MoneyActionReviewContent({
  action,
  onClose,
  onConfirmed,
  execute,
}: MoneyActionReviewProps & {
  execute: (action: PreparedMoneyAction) => Promise<OperationResult>;
}) {
  const [pending, setPending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { expired, recheckExpired } = useReactiveExpiry(action.expiresAt);

  async function confirm() {
    if (pending) return;
    if (!attempted && recheckExpired()) {
      setError("This prepared action expired. Prepare and review a fresh action.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await execute(action);
      setAttempted(true);
      if (isTerminalStatus(result.status)) {
        setError(messageForStatus(result.status));
        return;
      }
      onConfirmed(result);
    } catch {
      setAttempted(true);
      setError("The dispatch outcome is unresolved. Retry recording this same action; a new dispatch will not be created.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.review} aria-labelledby={`money-action-${action.id}`}>
      <h3 id={`money-action-${action.id}`}>{action.title}</h3>
      <dl className={styles.rows}>
        {action.amounts.map((amount, index) => (
          <div className={styles.row} key={`${amount.assetId}-${amount.direction}-${index}`}>
            <dt>{amount.maximum ? "Up to" : amount.direction === "spend" ? "You spend" : "You receive"}</dt>
            <dd>
              {amount.estimated ? "Estimated " : ""}
              {formatBaseUnitAmount(amount.amountBaseUnits, amount.decimals)} {amount.symbol}
            </dd>
          </div>
        ))}
        {action.calls.map((call, index) => {
          const approval = decodeMoneyActionApproval(call);
          return approval ? (
            <div className={styles.row} key={`${call.to}-${index}`}>
              <dt>Exact approval</dt>
              <dd>
                Token {approval.token}; spender {approval.spender}; cap {approval.amountBaseUnits} base units ({approval.assetId})
              </dd>
            </div>
          ) : (
            <div className={styles.row} key={`${call.to}-${index}`}>
              <dt>{action.calls.length === 1 ? "Target" : `Target ${index + 1}`}</dt>
              <dd>{call.to}</dd>
            </div>
          );
        })}
        <div className={styles.row}>
          <dt>Network</dt>
          <dd>Base (8453)</dd>
        </div>
        <div className={styles.row}>
          <dt>Valid until</dt>
          <dd>{new Date(action.expiresAt).toLocaleTimeString()}</dd>
        </div>
      </dl>
      {action.warnings.map((warning) => (
        <p className={styles.warning} key={warning}>{presentReviewWarning(warning)}</p>
      ))}
      {expired && !attempted ? <p className={styles.error} role="alert">This prepared action expired. Prepare and review a fresh action.</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button type="button" disabled={pending} onClick={onClose}>Back</button>
        <button type="button" disabled={pending || (expired && !attempted)} onClick={() => void confirm()}>
          {pending ? "Submitting…" : attempted ? "Retry" : action.kind === "swap" ? "Confirm swap" : "Confirm action"}
        </button>
      </div>
    </section>
  );
}

function presentReviewWarning(warning: string): string {
  if (/wallet will show the Base network fee/i.test(warning)) {
    return "Base network fees apply and are finalized at submission.";
  }
  return warning.replace(/the final wallet review binds/i, "final confirmation binds");
}

function isTerminalStatus(status: OperationResult["status"]): boolean {
  return status === "rejected" || status === "expired" || status === "failed";
}

function messageForStatus(status: OperationResult["status"]): string {
  switch (status) {
    case "rejected": return "The wallet request was rejected.";
    case "expired": return "This prepared action expired. Prepare a fresh action.";
    case "failed": return "The verified onchain receipt reported failure.";
    default: return "The action is pending.";
  }
}
