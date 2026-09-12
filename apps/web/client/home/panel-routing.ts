import type { ShellPanelId } from "@/config/navigation";
import {
  parseInboundUrlIntent,
  parseShellLocation,
  shellHref,
} from "@/config/shell-location";

export type HomeInboundPanelState = {
  panel: ShellPanelId;
  account: "signin" | "settings" | null;
  addMoney: boolean;
  returnedFromCoinbase: boolean;
  sendFlow: boolean;
  actionId: string | null;
};

export function readHomeInboundPanelState(
  search: URLSearchParams,
): HomeInboundPanelState {
  const intent = parseInboundUrlIntent(search);
  return {
    panel: intent.location.panel,
    account: intent.location.account,
    addMoney: intent.addMoney || intent.returnTo === "coinbase",
    returnedFromCoinbase: intent.returnTo === "coinbase",
    sendFlow: intent.flow === "send",
    actionId: intent.actionId,
  };
}

export function readHomePanel(search: URLSearchParams): ShellPanelId {
  return parseShellLocation(search).panel;
}

export function homePanelHref(
  shellPath: "/" | "/dashboard",
  panel: ShellPanelId,
): string {
  return shellHref(shellPath, { panel });
}
