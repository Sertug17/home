"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CopyableValue } from "@/components/copyable-value";
import { formatAddress } from "@/shared/formatting";
import {
  useAccountWallet,
  type AccountWalletClient,
} from "@/client/account/cdp-client";
import {
  commitClientUrl,
  moneyFlowHref,
  withoutMoneyFlowHref,
} from "@/config/shell-location";
import { SendDialog } from "./send-dialog";
import { TRANSFER_ASSETS, formatSendConfirmAmount } from "@/shared/transfers/transfer-helpers";
import type { ConfirmedTransfer } from "@/shared/transfers/types";
import styles from "./transfers.module.css";

const subscribeToMountedState = () => () => {};
const mountedClientSnapshot = () => true;
const mountedServerSnapshot = () => false;

export type TransferActionsProps = {
  initialOpen?: boolean;
  initialActionId?: string | null;
  onTransferConfirmed?: (transfer: ConfirmedTransfer) => void;
  availableByAsset?: Partial<Record<"usdc" | "eth", string>>;
};

type TransferWallet = Pick<
  AccountWalletClient,
  | "ownerKey"
  | "status"
  | "session"
  | "prepareMoneyAction"
  | "resumeMoneyAction"
  | "executeMoneyAction"
>;

export function TransferActions(props: TransferActionsProps) {
  const wallet = useAccountWallet();
  return <TransferActionsForWallet wallet={wallet} {...props} />;
}

export function TransferActionsForWallet({
  wallet,
  initialOpen = false,
  initialActionId = null,
  onTransferConfirmed,
  availableByAsset,
}: TransferActionsProps & { wallet: TransferWallet }) {
  const [sendOpen, setSendOpen] = useState(false);
  const [modalOwner, setModalOwner] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    transfer: ConfirmedTransfer;
    owner: string | null;
  } | null>(null);
  const openedInAppRef = useRef(false);
  const mounted = useSyncExternalStore(
    subscribeToMountedState,
    mountedClientSnapshot,
    mountedServerSnapshot,
  );
  const boundary = walletBoundary(wallet);
  const verifiedAddress =
    wallet.status === "verified" ? wallet.session?.smartAccount?.address ?? null : null;
  const visibleSend = modalOwner === boundary && sendOpen;
  const dropPrivate = modalOwner !== null && modalOwner !== boundary;
  const visibleSuccess = success && success.owner === boundary ? success.transfer : null;

  useEffect(() => {
    if (!initialOpen || !boundary) return;
    setSuccess(null);
    setModalOwner(boundary);
    setSendOpen(true);
  }, [boundary, initialOpen]);

  useEffect(() => {
    const onPopState = () => {
      const flow = new URLSearchParams(window.location.search).get("flow");
      if (flow !== "send") setSendOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openSend = () => {
    if (!boundary) return;
    openedInAppRef.current = true;
    setSuccess(null);
    setModalOwner(boundary);
    setSendOpen(true);
    commitClientUrl(moneyFlowHref("/dashboard"));
  };
  const close = () => {
    setSendOpen(false);
    if (openedInAppRef.current) {
      openedInAppRef.current = false;
      window.history.back();
    } else {
      commitClientUrl(withoutMoneyFlowHref("/dashboard"), "replace");
    }
  };
  const finishClose = () => {
    setSendOpen(false);
    setModalOwner(null);
  };

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 6000);
    return () => window.clearTimeout(timer);
  }, [success]);

  return (
    <div className={styles.actions} aria-label="Transfer actions">
      <button
        className={styles.secondaryAction}
        data-action-trigger=""
        type="button"
        disabled={!boundary}
        onClick={openSend}
      >
        Send
      </button>

      {mounted
        ? createPortal(
            <SendDialog
              open={visibleSend}
              address={verifiedAddress}
              immediate={dropPrivate}
              availableByAsset={availableByAsset}
              prepareMoneyAction={wallet.prepareMoneyAction}
              resumeMoneyAction={wallet.resumeMoneyAction}
              executeMoneyAction={wallet.executeMoneyAction}
              ownerBoundary={boundary}
              resumeActionId={initialActionId}
              onReview={(actionId) => {
                commitClientUrl(moneyFlowHref("/dashboard", actionId), "replace");
              }}
              onInvalidResume={() => {
                commitClientUrl(moneyFlowHref("/dashboard"), "replace");
              }}
              onTransferConfirmed={(transfer) => {
                setSuccess({ transfer, owner: boundary });
                onTransferConfirmed?.(transfer);
              }}
              onClose={close}
              onClosed={finishClose}
            />,
            document.body,
          )
        : null}

      {visibleSuccess ? (
        <div className={styles.successToast} role="status">
          <span className={styles.successMark} aria-hidden="true">✓</span>
          <div>
            <strong>Sent {formatSendConfirmAmount(visibleSuccess.amountBaseUnits, visibleSuccess.assetId)}</strong>
            <p>
              {TRANSFER_ASSETS[visibleSuccess.assetId].symbol} · Base ·{" "}
              <CopyableValue
                value={visibleSuccess.recipient}
                display={formatAddress(visibleSuccess.recipient)}
                valueKind="address"
              />
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function walletBoundary(wallet: TransferWallet): string | null {
  const session = wallet.status === "verified" ? wallet.session : null;
  return wallet.ownerKey && session?.smartAccount
    ? `${wallet.ownerKey}\u0000${session.user.subject}\u0000${session.smartAccount.address}\u0000${session.accountProvider}`
    : null;
}
