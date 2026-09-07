import "./dom-test-harness";

import { afterEach, describe, expect, test } from "bun:test";
import type { AccountWalletSdkBoundary } from "./cdp-client";
import {
  BaseAccountConnectorError,
  type BaseAccountConnector,
} from "./base-account-connector";

const { act, cleanup, fireEvent, render, waitFor, within } = await import(
  "@testing-library/react"
);
const { useMemo, useState } = await import("react");
const { AccountSignInSheet } = await import("./account-screen");
const { AccountWalletSessionOwner } = await import("./cdp-client");

function page() {
  return within(document.body);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function SheetHarness({
  requestEmailCode,
  baseAccountEnabled = false,
  baseAccountConnector,
}: {
  requestEmailCode: AccountWalletSdkBoundary["signInWithEmail"];
  baseAccountEnabled?: boolean;
  baseAccountConnector?: BaseAccountConnector;
}) {
  const [open, setOpen] = useState(false);
  const sdk = useMemo<AccountWalletSdkBoundary>(
    () => ({
      isInitialized: true,
      isSignedIn: false,
      ownerKey: null,
      signInWithEmail: requestEmailCode,
      verifyEmailOTP: async () => {},
      signInWithSiwe: async () => ({
        flowId: "unused-siwe-flow",
        message: "unused SIWE message",
      }),
      verifySiweSignature: async () => {},
      getAccessToken: async () => null,
      signOut: async () => {},
    }),
    [requestEmailCode],
  );

  return (
    <AccountWalletSessionOwner
      sdk={sdk}
      baseAccountEnabled={baseAccountEnabled}
      baseAccountConnector={baseAccountConnector}
    >
      <button type="button" onClick={() => setOpen(true)}>
        Open account
      </button>
      <AccountSignInSheet open={open} onClose={() => setOpen(false)} />
    </AccountWalletSessionOwner>
  );
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("production account sign-in sheet", () => {
  test("uses a modal dialog, keeps dynamic focus inside, and restores its trigger on Escape", async () => {
    const codeRequest = deferred<{ flowId: string }>();
    const trigger = render(
      <SheetHarness requestEmailCode={() => codeRequest.promise} />,
    ).getByRole("button", { name: "Open account" });

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await page().findByRole("dialog", { name: "Sign in to Home" });
    const emailInput = await page().findByRole("textbox", {
      name: "Email address",
    });
    expect(dialog).toBeInstanceOf(HTMLDialogElement);
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(emailInput);

    fireEvent.input(emailInput, {
      target: { value: "person@example.com" },
    });
    await waitFor(() =>
      expect((emailInput as HTMLInputElement).value).toBe("person@example.com"),
    );
    fireEvent.submit(emailInput.closest("form")!);
    await waitFor(() =>
      expect(
        (page().getByRole("button", {
          name: "Sending code…",
        }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );

    const busyCancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, busyCancel);
    expect(busyCancel.defaultPrevented).toBe(true);
    expect((dialog as HTMLDialogElement).open).toBe(true);

    await act(async () => {
      codeRequest.resolve({ flowId: "flow-1" });
      await codeRequest.promise;
    });

    const otpInput = await page().findByRole("textbox", {
      name: "Verification code",
    });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(otpInput);

    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);

    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(false));
    expect(cancel.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });

  test("shows email and Base Account side by side only when the deployment flag is enabled", async () => {
    const disabledView = render(
      <SheetHarness
        requestEmailCode={async () => ({ flowId: "unused-flow" })}
      />,
    );
    fireEvent.click(page().getByRole("button", { name: "Open account" }));
    expect(
      await page().findByRole("button", { name: "Continue with email" }),
    ).toBeTruthy();
    expect(
      page().queryByRole("button", { name: "Continue with Base Account" }),
    ).toBeNull();
    disabledView.unmount();

    render(
      <SheetHarness
        requestEmailCode={async () => ({ flowId: "unused-flow" })}
        baseAccountEnabled
        baseAccountConnector={async () => {
          throw new BaseAccountConnectorError("cancelled");
        }}
      />,
    );
    fireEvent.click(page().getByRole("button", { name: "Open account" }));
    expect(
      await page().findByRole("button", { name: "Continue with email" }),
    ).toBeTruthy();
    fireEvent.click(
      page().getByRole("button", { name: "Continue with Base Account" }),
    );
    expect((await page().findByRole("alert")).textContent).toContain(
      "Base Account sign-in was canceled",
    );
  });

  test("keeps the native dialog modal while Base Account connection is pending", async () => {
    const connection = deferred<never>();
    render(
      <SheetHarness
        requestEmailCode={async () => ({ flowId: "unused-flow" })}
        baseAccountEnabled
        baseAccountConnector={() => connection.promise}
      />,
    );
    fireEvent.click(page().getByRole("button", { name: "Open account" }));
    const dialog = page().getByRole("dialog", { name: "Sign in to Home" });
    fireEvent.click(
      await page().findByRole("button", { name: "Continue with Base Account" }),
    );
    expect(
      await page().findByText("Connecting to your existing Base Account…"),
    ).toBeTruthy();

    const busyCancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, busyCancel);
    expect(busyCancel.defaultPrevented).toBe(true);
    expect((dialog as HTMLDialogElement).open).toBe(true);
  });

  test("closes on a click outside the dialog surface but not on an inside click", async () => {
    render(
      <SheetHarness
        requestEmailCode={async () => ({ flowId: "unused-flow" })}
      />,
    );
    const trigger = page().getByRole("button", { name: "Open account" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await page().findByRole("dialog", { name: "Sign in to Home" });
    dialog.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 500,
        top: 100,
        bottom: 600,
        width: 400,
        height: 500,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(page().getByRole("heading", { name: "Sign in to Home" }), {
      clientX: 200,
      clientY: 200,
    });
    expect((dialog as HTMLDialogElement).open).toBe(true);

    fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(false));
    expect(document.activeElement).toBe(trigger);
  });
});
