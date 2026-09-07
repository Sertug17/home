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
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);

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

  const selected =
    loadState.status === "ready"
      ? loadState.data.candidates.find(
          (candidate) => candidate.vaultAddress === selectedAddress,
        ) ?? null
      : null;

  return (
    <section className={styles.experience} aria-labelledby="savings-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>USDC savings · Morpho V1</p>
          <h2 id="savings-title">Compare live vault candidates.</h2>
        </div>
        <div className={styles.network}>Base · USDC</div>
      </header>

      <p className={styles.intro}>
        These are read-only candidates, not a recommendation. Yield is variable,
        vault-specific, and can change. No vault is selected for you.
      </p>

      {loadState.status === "loading" ? <LoadingState /> : null}
      {loadState.status === "error" ? <ErrorState /> : null}
      {loadState.status === "ready" ? (
        <>
          <div className={styles.sourceRow}>
            <span>
              {loadState.data.stale ? "Stale fallback" : "Live response"} from
              Morpho GraphQL
            </span>
            <time dateTime={loadState.data.source.fetchedAt}>
              fetched {formatTimestamp(loadState.data.source.fetchedAt)}
            </time>
          </div>

          <div className={styles.candidateLayout}>
            <div className={styles.candidateList} aria-label="Vault candidates">
              {loadState.data.candidates.map((candidate) => {
                const isSelected = candidate.vaultAddress === selectedAddress;
                return (
                  <button
                    className={
                      isSelected
                        ? `${styles.candidate} ${styles.candidateSelected}`
                        : styles.candidate
                    }
                    key={candidate.vaultAddress}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedAddress(candidate.vaultAddress)}
                  >
                    <span className={styles.candidateIdentity}>
                      <strong>{candidate.name}</strong>
                      <small>{candidate.symbol}</small>
                    </span>
                    <span className={styles.rate}>
                      <small>current net APY</small>
                      <strong>{formatRate(candidate.netApy)}</strong>
                    </span>
                    <span className={styles.inspect}>Inspect details</span>
                  </button>
                );
              })}
            </div>

            <VaultDetails candidate={selected} />
          </div>
        </>
      ) : null}

      <PositionStatus session={session} />

      <div className={styles.actionBar} aria-label="Savings actions unavailable">
        <div>
          <strong>Transactions are not enabled.</strong>
          <span>
            Vault selection, product review, simulation, and shared signing are
            still required.
          </span>
        </div>
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
      <strong>Loading current vault data</strong>
      <span>No yield or balance is shown until the source responds.</span>
    </div>
  );
}

function ErrorState() {
  return (
    <div className={styles.notice} role="alert">
      <strong>Vault data is unavailable</strong>
      <span>
        No APY, liquidity, fee, or total is being assumed. Try again later.
      </span>
    </div>
  );
}

function VaultDetails({ candidate }: { candidate: MorphoVaultCandidate | null }) {
  if (!candidate) {
    return (
      <aside className={styles.details} aria-label="Vault details">
        <p className={styles.detailsKicker}>Nothing selected</p>
        <h3>Choose a candidate to inspect its sourced details.</h3>
        <p>
          Inspecting a row does not choose a savings product or authorize a
          transaction.
        </p>
      </aside>
    );
  }

  return (
    <aside className={styles.details} aria-label={`${candidate.name} details`}>
      <div className={styles.detailsHeading}>
        <div>
          <p className={styles.detailsKicker}>Morpho V1 candidate</p>
          <h3>{candidate.name}</h3>
        </div>
        <span>{candidate.listed ? "listed" : "not listed"}</span>
      </div>

      <dl className={styles.metrics}>
        <Metric
          label="Current net APY"
          value={formatRate(candidate.netApy)}
          note="Variable; API state, not a guarantee"
        />
        <Metric
          label="Vault fee"
          value={formatRate(candidate.feeRate)}
          note="Rate reported by Morpho V1"
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
        <div>
          <span>State as of</span>
          <time dateTime={candidate.stateAsOf ?? undefined}>
            {candidate.stateAsOf
              ? formatTimestamp(candidate.stateAsOf)
              : "Unavailable"}
          </time>
        </div>
      </div>
    </aside>
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
  let message =
    "Sign in to establish a verified smart account before any private position read.";
  if (session && !session.smartAccount) {
    message = "A verified session exists, but no Base smart account is available.";
  }
  if (session?.smartAccount) {
    message = `Verified account ${shortenAddress(session.smartAccount.address)} is available for parent integration. Its position has not been requested in this public view.`;
  }

  return (
    <section className={styles.position} aria-labelledby="position-title">
      <div>
        <p className={styles.detailsKicker}>Your position</p>
        <h3 id="position-title">Balance unavailable</h3>
      </div>
      <p>{message}</p>
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
