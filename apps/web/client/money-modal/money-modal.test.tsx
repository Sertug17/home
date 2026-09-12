import "@/client/account/dom-test-harness";

import { page } from "@/tests/helpers/dom";
import { afterEach, describe, expect, test } from "bun:test";
import { useState } from "react";

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { MoneyModal, MoneyModalFooter, MoneyModalHeader } = await import("./money-modal");

function Harness({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open money
      </button>
      <MoneyModal
        open={open}
        labelledBy="money-sheet-title"
        immediate
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
      >
        <MoneyModalHeader
          title="Send"
          titleId="money-sheet-title"
          onClose={() => setOpen(false)}
          closeLabel="Close send dialog"
        />
        <div>Amount body</div>
        <MoneyModalFooter primaryLabel="Continue" onPrimary={() => {}} />
      </MoneyModal>
    </>
  );
}

afterEach(cleanup);

describe("MoneyModal shell", () => {
  test("opens as a labelled modal and moves focus inside", () => {
    render(<Harness />);
    fireEvent.click(page().getByRole("button", { name: "Open money" }));

    const dialog = page().getByRole("dialog", { name: "Send" });
    expect(dialog).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  test("dismisses from the close button and restores the trigger", () => {
    render(<Harness />);
    const trigger = page().getByRole("button", { name: "Open money" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(page().getByRole("button", { name: "Close send dialog" }));

    expect(page().queryByRole("dialog", { name: "Send" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("dismisses only backdrop clicks", () => {
    render(<Harness startOpen />);
    fireEvent.click(page().getByRole("heading", { name: "Send" }));
    expect(page().getByRole("dialog", { name: "Send" })).toBeTruthy();

    fireEvent.click(page().getByRole("dialog", { name: "Send" }));
    expect(page().queryByRole("dialog", { name: "Send" })).toBeNull();

  });

  test("keeps the modal open when cancellation is rejected", () => {
    render(
      <MoneyModal
        open
        labelledBy="blocked-title"
        immediate
        onCancel={() => false}
        onClose={() => {}}
      >
        <h2 id="blocked-title">Blocked</h2>
      </MoneyModal>,
    );

    fireEvent.click(page().getByRole("dialog", { name: "Blocked" }));
    expect(page().getByRole("dialog", { name: "Blocked" })).toBeTruthy();
  });
});
