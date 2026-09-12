import type { ComponentPropsWithRef, MouseEvent } from "react";
import { haptic, type HapticFeedback } from "./haptic";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: "primary" | "secondary" | "quiet";
  /** Presentation only. Caller owns asynchronous work and announcements.
   * Blocks native activation and preserves the original accessible name/size.
   */
  loading?: boolean;
  /** Opt in only for actions that commit a user decision. */
  hapticFeedback?: HapticFeedback;
};

export function Button({
  type = "button",
  variant = "primary",
  loading = false,
  disabled = false,
  className,
  children,
  hapticFeedback,
  onClick,
  "aria-busy": ariaBusy,
  ...props
}: ButtonProps) {
  const handleClick = hapticFeedback
    ? (event: MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) haptic(hapticFeedback);
      }
    : onClick;

  return (
    <button
      {...props}
      onClick={handleClick}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : ariaBusy}
      data-variant={variant}
      data-loading={loading || undefined}
      className={["home-ui-button isolate", className].filter(Boolean).join(" ")}
    >
      <span className="home-ui-button__label">{children}</span>
      {loading && <span className="home-ui-button__spinner" aria-hidden="true" />}
    </button>
  );
}
