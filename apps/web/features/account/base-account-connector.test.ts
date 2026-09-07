import { describe, expect, test } from "bun:test";
import {
  BaseAccountConnectorError,
  connectWithBaseProvider,
  utf8MessageToHex,
} from "./base-account-connector";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";

type EventName = "accountsChanged" | "chainChanged" | "disconnect";

class ProviderFixture {
  accounts = [ADDRESS];
  chainId = "0x2105";
  signature: unknown = "0x1234";
  emitAccountsDuringConnect = false;
  requests: { method: string; params?: readonly unknown[] | object }[] = [];
  listeners = new Map<EventName, Set<(value: never) => void>>();

  on(event: EventName, listener: (value: never) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  removeListener(event: EventName, listener: (value: never) => void) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: EventName, value?: unknown) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(value as never);
    }
  }

  async request(args: {
    method: string;
    params?: readonly unknown[] | object;
  }): Promise<unknown> {
    this.requests.push(args);
    switch (args.method) {
      case "wallet_switchEthereumChain":
        return null;
      case "eth_requestAccounts":
        if (this.emitAccountsDuringConnect) {
          this.emit("accountsChanged", this.accounts);
        }
        return this.accounts;
      case "eth_accounts":
        return this.accounts;
      case "eth_chainId":
        return this.chainId;
      case "personal_sign":
        return this.signature;
      default:
        throw new Error("unexpected provider request");
    }
  }

  async disconnect() {}
}

function asProvider(provider: ProviderFixture) {
  return provider as unknown as Parameters<typeof connectWithBaseProvider>[0];
}

describe("Base Account connector boundary", () => {
  test("requests Base 8453, keeps the universal account, and signs the exact UTF-8 message", async () => {
    const provider = new ProviderFixture();
    provider.emitAccountsDuringConnect = true;
    const invalidations: string[] = [];
    const connection = await connectWithBaseProvider(
      asProvider(provider),
      (reason) => invalidations.push(reason),
    );

    expect(connection.address).toBe(ADDRESS);
    expect(provider.requests.slice(0, 3)).toEqual([
      {
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x2105" }],
      },
      { method: "eth_requestAccounts" },
      { method: "eth_chainId" },
    ]);

    const message = "home.example wants you to sign in\nUnicode: ₿";
    expect(utf8MessageToHex(message)).toBe(
      `0x${Buffer.from(message, "utf8").toString("hex")}`,
    );
    await expect(connection.signMessage(message)).resolves.toBe("0x1234");
    expect(
      provider.requests.find((request) => request.method === "personal_sign"),
    ).toEqual({
      method: "personal_sign",
      params: [utf8MessageToHex(message), ADDRESS],
    });
    expect(invalidations).toEqual([]);
  });

  test("maps a provider rejection to a canceled connection", async () => {
    const provider = new ProviderFixture();
    provider.request = async () => {
      throw { code: 4001, message: "fixture rejection" };
    };

    await expect(
      connectWithBaseProvider(asProvider(provider), () => {}),
    ).rejects.toEqual(
      expect.objectContaining({
        reason: "cancelled",
      }) as BaseAccountConnectorError,
    );
  });

  test("rejects account and chain changes before verification can continue", async () => {
    const accountProvider = new ProviderFixture();
    const accountConnection = await connectWithBaseProvider(
      asProvider(accountProvider),
      () => {},
    );
    accountProvider.accounts = [OTHER_ADDRESS];
    accountProvider.emit("accountsChanged", [OTHER_ADDRESS]);
    await expect(accountConnection.assertUnchanged()).rejects.toMatchObject({
      reason: "account-changed",
    });

    const chainProvider = new ProviderFixture();
    const chainConnection = await connectWithBaseProvider(
      asProvider(chainProvider),
      () => {},
    );
    chainProvider.chainId = "0x1";
    chainProvider.emit("chainChanged", "0x1");
    await expect(chainConnection.assertUnchanged()).rejects.toMatchObject({
      reason: "chain-changed",
    });
  });

  test("rejects malformed signatures instead of forwarding them to CDP", async () => {
    const provider = new ProviderFixture();
    provider.signature = "not-hex";
    const connection = await connectWithBaseProvider(
      asProvider(provider),
      () => {},
    );

    await expect(connection.signMessage("fixture")).rejects.toMatchObject({
      reason: "invalid-provider-response",
    });
  });
});
