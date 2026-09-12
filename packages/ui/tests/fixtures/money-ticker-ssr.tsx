import { strict as assert } from "node:assert";
import { renderToStaticMarkup } from "react-dom/server";
import { MoneyTicker } from "@home/ui/money-ticker";

const values = [
  "R$ 1.234,56",
  "Rp 78.123.456,00",
  "$0.0000001234",
  "−0,67 %",
] as const;

assert.equal(typeof globalThis.window, "undefined");

for (const value of values) {
  const markup = renderToStaticMarkup(
    <MoneyTicker value={value} animated={false} />,
  );
  const visibleText = markup
    .replace(/<span class="home-ui-money-ticker__fallback"[\s\S]*?<\/span>/g, "")
    .replace(/<template[\s\S]*?<\/template\s*>/g, "")
    .replace(/<style[\s\S]*?<\/style\s*>/g, "")
    .replace(/<[^>]+>/g, "");

  assert.equal(visibleText, value);
  assert.match(markup, new RegExp(`aria-label="${escapeRegExp(value)}"`));
}

console.log(`MoneyTicker SSR preserved ${values.length} exact formatted values.`);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
