import "./dom";
import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import {
  MoneyTicker,
  splitMoneyTickerValue,
} from "@home/ui/money-ticker";

afterEach(cleanup);

const trickyValues = [
  "R$ 1.234,56",
  "Rp 78.123.456,00",
  "$0.0000001234",
  "−0,67 %",
] as const;

test("formatted money parts round-trip without numeric coercion", () => {
  for (const value of trickyValues) {
    const parts = splitMoneyTickerValue(value);
    expect(`${parts.prefix}${parts.numeric}${parts.suffix}`).toBe(value);
  }
});

test("SSR/static output preserves every formatted character", () => {
  const process = Bun.spawnSync(["bun", "tests/fixtures/money-ticker-ssr.tsx"], {
    cwd: new URL("..", import.meta.url).pathname,
  });

  expect(process.stderr.toString()).toBe("");
  expect(process.exitCode).toBe(0);
  expect(process.stdout.toString()).toContain(
    `MoneyTicker SSR preserved ${trickyValues.length} exact formatted values.`,
  );
});

test("a placeholder replaces animated digits immediately", () => {
  const view = render(<MoneyTicker value="$12.34" />);
  expect(view.container.querySelectorAll("number-flow-react")).toHaveLength(4);

  view.rerender(<MoneyTicker value="—" />);

  const ticker = view.container.querySelector<HTMLElement>(".home-ui-money-ticker");
  expect(ticker?.getAttribute("aria-label")).toBe("—");
  expect(ticker?.querySelector(".home-ui-money-ticker__track")?.textContent).toBe("—");
  expect(view.container.querySelector("number-flow-react")).toBeNull();
});
