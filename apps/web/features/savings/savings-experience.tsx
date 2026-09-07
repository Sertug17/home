"use client";

import { useEffect, useState } from "react";
import type {
  Address,
  MorphoVaultCandidate,
  MorphoVaultsResult,
} from "@/server/morpho/types";
import styles from "./savings-experience.module.css";

type SavingsSession = {
  user: { subject: string };
  smartAccount: { address: Address; chainId: 8453 } | null;
};

type SavingsExperienceProps = {
  initialData?: MorphoVaultsResult | null;
  session?: SavingsSession | null;
};

type LoadState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: MorphoVaultsResult }
  | { status: "error"; data: null };

export function SavingsExperience({
  initialData = null,
  session = null,
}: SavingsExperienceProps) {
  const [loadState, setLoadState] = useState<LoadState>(
    initialData
      ? { status: "ready", data: initialData }
      : { status: "loading", data: null },
  );

  useEffect(() => {
    if (initialData) return;

    const controller = new AbortController();
    void fetch("/api/savings/vaults", {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Vault request failed");
        return (await response.json()) as MorphoVaultsResult;
      })
      .then((data) => setLoadState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadState({ status: "error", data: null });
      });

    return () => controller.abort();
  }, [initialData]);

  return (
    <section className={styles.experience} aria-labelledby="savings-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Savings</p>
          <h2 id="savings-title">USDC</h2>
        </div>
        <span>Base · Morpho V1</span>
      </header>

      <PositionStatus session={session} />

      <section className={styles.comparison} aria-labelledby="rates-title">
        <div className={styles.comparisonHeading}>
          <div>
            <p className={styles.detailsKicker}>Rate comparison</p>
            <h3 id="rates-title">Vault candidates</h3>
          </div>
          <span>Variable rates · no default selection</span>
        </div>

        {loadState.status === "loading" ? <LoadingState /> : null}
        {loadState.status === "error" ? <ErrorState /> : null}
        {loadState.status === "ready" ? (
          <>
            <div className={styles.sourceRow}>
              <span>
                {loadState.data.stale ? "Stale fallback snapshot" : "Fetched snapshot"}
              </span>
              <time dateTime={loadState.data.source.fetchedAt}>
                As of {formatTimestamp(loadState.data.source.fetchedAt)}
              </time>
            </div>

            <div className={styles.candidateList} aria-label="Vault candidates">
              {loadState.data.candidates.map((candidate) => (
                <VaultCandidateRow
                  key={candidate.vaultAddress}
                  candidate={candidate}
                />
              ))}
            </div>
          </>
        ) : null}
      </section>

      <div className={styles.actionBar} aria-label="Savings actions unavailable">
        <span>Transactions are not enabled.</span>
        <button type="button" disabled title="Deposits are not enabled">
          Deposit unavailable
        </button>
        <button type="button" disabled title="Withdrawals are not enabled">
          Withdraw unavailable
        </button>
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className={styles.notice} role="status">
      <strong>Loading rate snapshots</strong>
      <span>No rate is shown until the source responds.</span>
    </div>
  );
}

function ErrorState() {
  return (
    <div className={styles.notice} role="alert">
      <strong>Rate data unavailable</strong>
      <span>No APY, fee, liquidity, or total is being assumed.</span>
    </div>
  );
}

function VaultCandidateRow({ candidate }: { candidate: MorphoVaultCandidate }) {
  return (
    <article className={styles.candidate}>
      <div className={styles.candidateSummary}>
        <span className={styles.candidateIdentity}>
          <strong>{candidate.name}</strong>
          <small>{candidate.symbol}</small>
        </span>
        <span className={styles.rate}>
          <small>Variable net APY</small>
          <strong>{formatRate(candidate.netApy)}</strong>
          <time dateTime={candidate.stateAsOf ?? undefined}>
            As of {candidate.stateAsOf ? formatTimestamp(candidate.stateAsOf) : "unavailable"}
          </time>
        </span>
      </div>

      <details className={styles.details}>
        <summary>Fees, liquidity, curator, addresses, and risks</summary>
        <div className={styles.detailsContent}>
          <p>
            Read-only candidate, not a recommendation. Yield is variable and
            vault-specific. Opening details does not select a product.
          </p>
          <dl className={styles.metrics}>
            <Metric
              label="Vault fee"
              value={formatRate(candidate.feeRate)}
              note="Reported by Morpho V1"
            />
            <Metric
              label="Total assets"
              value={formatTokenAmount(candidate.totalAssetsRaw, 6)}
              note="Vault-wide, not your balance"
            />
            <Metric
              label="Indexed liquidity"
              value={formatTokenAmount(candidate.liquidityRaw, 6)}
              note="Not the account's max withdrawal"
            />
            <Metric
              label="Listing status"
              value={candidate.listed ? "Listed" : "Not listed"}
              note="Source snapshot status"
            />
          </dl>
          <div className={styles.provenance}>
            <div>
              <span>Curator address</span>
              <code title={candidate.curatorAddress ?? undefined}>
                {candidate.curatorAddress
                  ? shortenAddress(candidate.curatorAddress)
                  : "Unavailable"}
              </code>
            </div>
            <div>
              <span>Vault address</span>
              <code title={candidate.vaultAddress}>
                {shortenAddress(candidate.vaultAddress)}
              </code>
            </div>
          </div>
        </div>
      </details>
    </article>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
        <small>{note}</small>
      </dd>
    </div>
  );
}

function PositionStatus({ session }: { session: SavingsSession | null }) {
  let status = "Sign in to see a verified USDC position.";
  if (session && !session.smartAccount) {
    status = "Verified session; Base account unavailable.";
  }
  if (session?.smartAccount) {
    status = `Verified account ${shortenAddress(session.smartAccount.address)}; position not requested.`;
  }

  return (
    <section className={styles.position} aria-labelledby="position-title">
      <div>
        <p className={styles.detailsKicker}>Your position</p>
        <h3 id="position-title">USDC balance</h3>
      </div>
      <div className={styles.positionValue} aria-label="USDC balance unavailable">
        <strong aria-hidden="true">—</strong>
        <span>Balance unavailable</span>
      </div>
      <p>{status}</p>
    </section>
  );
}

function formatRate(value: number | null) {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: value === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTokenAmount(raw: string | null, decimals: number) {
  if (raw === null) return "Unavailable";
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}${fraction ? `.${fraction}` : ""} USDC`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function shortenAddress(address: Address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
