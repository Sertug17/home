const canonicalIntegerPattern = /^(?:0|[1-9][0-9]*)$/;
const decimalPattern = /^(-?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;
const minimumUsdFractionDigits = 2;
const maximumTinyUsdFractionDigits = 8;

export type DecimalInput = number | string;

type Decimal = {
  negative: boolean;
  digits: string;
  scale: number;
};

/**
 * Formats a USD price for display without changing the source string used by
 * market-data consumers. Ordinary prices use cents; sub-cent prices retain
 * useful significant digits within a fixed display bound.
 */
export function formatUsdPrice(value: DecimalInput): string | null {
  const decimal = parseDecimal(value);
  if (!decimal) return null;

  if (decimal.digits === "0") return "$0.00";

  const absoluteDecimal = { ...decimal, negative: false };
  if (isLessThan(absoluteDecimal, "0.01")) {
    if (isLessThan(absoluteDecimal, "0.00000001")) {
      return `${decimal.negative ? "-" : ""}<$0.00000001`;
    }

    const fraction = decimalFraction(absoluteDecimal);
    const firstSignificant = fraction.search(/[1-9]/);
    const fractionDigits = Math.min(
      firstSignificant + 4,
      maximumTinyUsdFractionDigits,
    );
    return `${decimal.negative ? "-$" : "$"}${formatDecimal(decimal, fractionDigits, 0)}`;
  }

  return `${decimal.negative ? "-$" : "$"}${formatDecimal(decimal, minimumUsdFractionDigits, minimumUsdFractionDigits)}`;
}

/** Formats a finite decimal rate as a consistently rounded percentage. */
export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: value === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formats canonical integer token base units for compact display. The exact
 * `formatBaseUnitAmount` result remains available for signing and calculations.
 * Nonzero amounts below the display precision are explicitly marked as tiny.
 */
export function formatTokenAmount(
  balanceBaseUnits: string,
  decimals: number,
  maximumFractionDigits = Math.min(6, decimals),
): string {
  if (!canonicalIntegerPattern.test(balanceBaseUnits)) {
    throw new TypeError("balanceBaseUnits must be a canonical decimal integer.");
  }
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new TypeError("decimals must be an integer from 0 through 255.");
  }
  if (
    !Number.isSafeInteger(maximumFractionDigits) ||
    maximumFractionDigits < 0 ||
    maximumFractionDigits > decimals
  ) {
    throw new TypeError(
      "maximumFractionDigits must be an integer from 0 through decimals.",
    );
  }

  if (balanceBaseUnits === "0") return "0";
  if (decimals === 0) return groupDigits(balanceBaseUnits);

  const padded = balanceBaseUnits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals);
  const visibleFraction = fraction
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, "");

  if (whole === "0" && visibleFraction === "") {
    return maximumFractionDigits === 0
      ? "<1"
      : `<0.${"0".repeat(maximumFractionDigits - 1)}1`;
  }

  return `${groupDigits(whole)}${visibleFraction ? `.${visibleFraction}` : ""}`;
}

function parseDecimal(value: DecimalInput): Decimal | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    value = String(value);
  }
  if (value !== value.trim()) return null;

  const match = decimalPattern.exec(value);
  if (!match) return null;

  const negative = match[1] === "-";
  let digits = `${match[2]}${match[3] ?? ""}`.replace(/^0+/, "") || "0";
  let scale = (match[3]?.length ?? 0) - Number(match[4] ?? "0");
  if (!Number.isSafeInteger(scale) || Math.abs(scale) > 10_000) return null;
  if (digits === "0") {
    return { negative: false, digits: "0", scale: 0 };
  }

  if (scale < 0) {
    digits += "0".repeat(-scale);
    scale = 0;
  }

  return { negative: digits === "0" ? false : negative, digits, scale };
}

function isLessThan(decimal: Decimal, comparison: string): boolean {
  if (decimal.negative) return true;
  const other = parseDecimal(comparison);
  if (!other) throw new Error("Invalid comparison decimal.");

  const scale = Math.max(decimal.scale, other.scale);
  const left = BigInt(decimal.digits) * BigInt(10) ** BigInt(scale - decimal.scale);
  const right = BigInt(other.digits) * BigInt(10) ** BigInt(scale - other.scale);
  return left < right;
}

function decimalFraction(decimal: Decimal): string {
  if (decimal.scale === 0) return "";
  return decimal.digits.padStart(decimal.scale + 1, "0").slice(-decimal.scale);
}

function formatDecimal(
  decimal: Decimal,
  fractionDigits: number,
  minimumFractionDigits: number,
): string {
  const rounded = roundDigits(decimal.digits, decimal.scale, fractionDigits);
  const padded = rounded.padStart(fractionDigits + 1, "0");
  const whole = padded.slice(0, -fractionDigits) || "0";
  let fraction = fractionDigits === 0 ? "" : padded.slice(-fractionDigits);

  while (fraction.length > minimumFractionDigits && fraction.endsWith("0")) {
    fraction = fraction.slice(0, -1);
  }

  return `${groupDigits(whole)}${fraction ? `.${fraction}` : ""}`;
}

function roundDigits(digits: string, scale: number, fractionDigits: number): string {
  if (scale <= fractionDigits) {
    return `${digits}${"0".repeat(fractionDigits - scale)}`;
  }

  const divisor = BigInt(10) ** BigInt(scale - fractionDigits);
  return ((BigInt(digits) + divisor / BigInt(2)) / divisor).toString();
}

function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
