"use client";

import type { ProviderInterface } from "@base-org/account";
import { BASE_CHAIN_ID } from "./session-types";

const BASE_CHAIN_HEX = "0x2105";
const evmAddressPattern = /^0x[0-9a-fA-F]{40}$/;
const hexPattern = /^0x(?:[0-9a-fA-F]{2})+$/;

export type BaseAccountInvalidation =
  | "account-changed"
  | "chain-changed"
  | "disconnected";

export class BaseAccountConnectorError extends Error {
  readonly reason:
    | BaseAccountInvalidation
    | "cancelled"
    | "invalid-provider-response";

  constructor(
    reason: BaseAccountConnectorError["reason"],
    cause?: unknown,
  ) {
    super(reason, { cause });
    this.name = "BaseAccountConnectorError";
    this.reason = reason;
  }
}

export type ConnectedBaseAccount = {
  address: `0x${string}`;
  assertUnchanged: () => Promise<void>;
  signMessage: (message: string) => Promise<`0x${string}`>;
  disconnect: () => Promise<void>;
};

export type BaseAccountConnector = (
  onInvalidated: (reason: BaseAccountInvalidation) => void,
) => Promise<ConnectedBaseAccount>;

type BaseAccountProvider = Pick<
  ProviderInterface,
  "request" | "on" | "removeListener" | "disconnect"
>;

function providerErrorCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  return typeof error.code === "number" ? error.code : null;
}

function normalizeAddress(value: unknown): `0x${string}` | null {
  return typeof value === "string" && evmAddressPattern.test(value)
    ? (value.toLowerCase() as `0x${string}`)
    : null;
}

function firstAddress(value: unknown): `0x${string}` | null {
  return Array.isArray(value) ? normalizeAddress(value[0]) : null;
}

function chainIdFromProvider(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value.slice(2), 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function utf8MessageToHex(message: string): `0x${string}` {
  const bytes = new TextEncoder().encode(message);
  return `0x${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

export async function connectWithBaseProvider(
  provider: BaseAccountProvider,
  onInvalidated: (reason: BaseAccountInvalidation) => void,
): Promise<ConnectedBaseAccount> {
  let invalidation: BaseAccountInvalidation | null = null;
  let connectedAddress: `0x${string}` | null = null;

  const invalidate = (reason: BaseAccountInvalidation) => {
    if (invalidation) {
      return;
    }
    invalidation = reason;
    onInvalidated(reason);
  };
  const onAccountsChanged = (accounts: string[]) => {
    if (!connectedAddress) {
      return;
    }
    if (firstAddress(accounts) !== connectedAddress) {
      invalidate("account-changed");
    }
  };
  const onChainChanged = (chainId: string) => {
    if (chainIdFromProvider(chainId) !== BASE_CHAIN_ID) {
      invalidate("chain-changed");
    }
  };
  const onDisconnect = () => invalidate("disconnected");

  provider.on("accountsChanged", onAccountsChanged);
  provider.on("chainChanged", onChainChanged);
  provider.on("disconnect", onDisconnect);

  const removeListeners = () => {
    provider.removeListener("accountsChanged", onAccountsChanged);
    provider.removeListener("chainChanged", onChainChanged);
    provider.removeListener("disconnect", onDisconnect);
  };

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_HEX }],
    });
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    connectedAddress = firstAddress(accounts);
    const chainId = chainIdFromProvider(
      await provider.request({ method: "eth_chainId" }),
    );

    if (!connectedAddress || chainId !== BASE_CHAIN_ID) {
      throw new BaseAccountConnectorError("invalid-provider-response");
    }
  } catch (error) {
    removeListeners();
    if (error instanceof BaseAccountConnectorError) {
      throw error;
    }
    if (providerErrorCode(error) === 4001) {
      throw new BaseAccountConnectorError("cancelled", error);
    }
    throw new BaseAccountConnectorError("invalid-provider-response", error);
  }

  const assertUnchanged = async () => {
    if (invalidation) {
      throw new BaseAccountConnectorError(invalidation);
    }

    const [accounts, chainIdValue] = await Promise.all([
      provider.request({ method: "eth_accounts" }),
      provider.request({ method: "eth_chainId" }),
    ]);
    if (firstAddress(accounts) !== connectedAddress) {
      invalidate("account-changed");
      throw new BaseAccountConnectorError("account-changed");
    }
    if (chainIdFromProvider(chainIdValue) !== BASE_CHAIN_ID) {
      invalidate("chain-changed");
      throw new BaseAccountConnectorError("chain-changed");
    }
    if (invalidation) {
      throw new BaseAccountConnectorError(invalidation);
    }
  };

  return {
    address: connectedAddress,
    assertUnchanged,
    async signMessage(message) {
      await assertUnchanged();
      let signature: unknown;
      try {
        signature = await provider.request({
          method: "personal_sign",
          params: [utf8MessageToHex(message), connectedAddress],
        });
      } catch (error) {
        if (providerErrorCode(error) === 4001) {
          throw new BaseAccountConnectorError("cancelled", error);
        }
        throw new BaseAccountConnectorError("invalid-provider-response", error);
      }
      await assertUnchanged();
      if (typeof signature !== "string" || !hexPattern.test(signature)) {
        throw new BaseAccountConnectorError("invalid-provider-response");
      }
      return signature as `0x${string}`;
    },
    async disconnect() {
      removeListeners();
      try {
        await provider.disconnect();
      } catch {
        // Local connector cleanup must not expose provider internals.
      }
    },
  };
}

export const connectBaseAccount: BaseAccountConnector = async (
  onInvalidated,
) => {
  const { createBaseAccountSDK } = await import("@base-org/account");
  const provider = createBaseAccountSDK({
    appName: "Home",
    appChainIds: [BASE_CHAIN_ID],
    preference: { telemetry: false },
    subAccounts: {
      creation: "manual",
      defaultAccount: "universal",
      funding: "manual",
    },
  }).getProvider();

  return connectWithBaseProvider(provider, onInvalidated);
};
