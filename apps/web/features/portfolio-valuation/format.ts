import type { ExactDecimal } from "@/server/valuation/types";

const integerPattern = /^(?:0|[1-9]\d*)$/;

export function formatFiatValue(
  value: ExactDecimal,
  currency: string,
  fractionDigits = 2,
): string {
  if (
    !integerPattern.test(value.atoms) ||
    !Number.isSafeInteger(value.scale) ||
    value.scale < 0 ||
    !Number.isSafeInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > 6
  ) {
    throw new TypeError("The fiat value is invalid.");
  }
  const atoms = BigInt(value.atoms);
  const rounded = roundAtoms(atoms, value.scale, fractionDigits);
  if (atoms > BigInt(0) && rounded === BigInt(0)) {
    const threshold =
      fractionDigits === 0 ? "1" : `0.${"0".repeat(fractionDigits - 1)}1`;
    return `${currency} <${threshold}`;
  }
  const divisor = BigInt(10) ** BigInt(fractionDigits);
  const whole = rounded / divisor;
  const fraction = (rounded % divisor).toString().padStart(fractionDigits, "0");
  const grouped = groupDigits(whole.toString(10));
  return `${currency} ${grouped}${fractionDigits > 0 ? `.${fraction}` : ""}`;
}

function roundAtoms(atoms: bigint, scale: number, targetScale: number): bigint {
  if (scale <= targetScale) return atoms * BigInt(10) ** BigInt(targetScale - scale);
  const divisor = BigInt(10) ** BigInt(scale - targetScale);
  const quotient = atoms / divisor;
  const remainder = atoms % divisor;
  const doubled = remainder * BigInt(2);
  return doubled > divisor || (doubled === divisor && quotient % BigInt(2) === BigInt(1))
    ? quotient + BigInt(1)
    : quotient;
}

function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
