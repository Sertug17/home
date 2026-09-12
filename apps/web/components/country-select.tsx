"use client";

import * as Select from "@radix-ui/react-select";
import {
  isRegionId,
  presentationRegions,
  regionIds,
  type RegionId,
} from "@/config/regions";

type CountrySelectProps = {
  value: RegionId;
  onValueChange: (regionId: RegionId) => void;
  describedBy: string;
  variant?: "default" | "settings";
};

export function CountrySelect({
  value,
  onValueChange,
  describedBy,
  variant = "default",
}: CountrySelectProps) {
  return (
    <Select.Root
      value={value}
      onValueChange={(nextValue) => {
        if (isRegionId(nextValue)) onValueChange(nextValue);
      }}
    >
      <Select.Trigger
        id="country"
        aria-label="Country"
        aria-describedby={describedBy}
        className={
          variant === "settings"
            ? "flex min-h-11 items-center justify-end gap-1 border-0 bg-transparent p-0 text-right text-[0.92rem] font-semibold text-[var(--fg)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--home-ui-color-focus)]"
            : "surface-primary flex min-h-[47px] w-full items-center justify-between rounded-home-ui-control border border-[var(--separator)] px-[13px] text-left text-[0.9rem] font-semibold text-[var(--fg)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--home-ui-color-focus)] data-[state=open]:border-[var(--home-ui-color-action)]"
        }
      >
        <Select.Value />
        <Select.Icon aria-hidden="true" className="ml-3 shrink-0 text-[var(--fg-muted)]">
          <ChevronIcon />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          onKeyDownCapture={(event) => {
            if (event.key !== "Home" && event.key !== "End") return;

            const options = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                '[role="option"]:not([data-disabled])',
              ),
            );
            const target = event.key === "Home" ? options[0] : options.at(-1);
            if (!target) return;

            event.preventDefault();
            event.stopPropagation();
            target.focus();
          }}
          className="surface-primary z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-home-ui-control border border-[var(--separator)] p-1 text-[var(--fg)] shadow-[0_12px_32px_rgba(10,11,13,0.16)]"
        >
          <Select.ScrollUpButton className="flex h-8 cursor-default items-center justify-center text-[var(--fg-muted)]">
            <ScrollChevronIcon direction="up" />
            <span className="sr-only">Scroll to earlier countries</span>
          </Select.ScrollUpButton>
          <Select.Viewport className="max-h-[min(20rem,var(--radix-select-content-available-height))] overscroll-contain">
            {regionIds.map((id) => (
              <Select.Item
                key={id}
                value={id}
                className="relative flex min-h-10 w-full cursor-default select-none items-center rounded-home-ui-control py-2 pl-3 pr-9 text-left text-sm font-semibold outline-none data-[highlighted]:bg-[var(--home-ui-color-subtle-hover)] data-[state=checked]:bg-[var(--home-ui-color-subtle-hover)]"
              >
                <Select.ItemText>
                  {presentationRegions[id].selectorLabel}
                </Select.ItemText>
                <Select.ItemIndicator className="absolute right-3 inline-flex items-center text-[var(--home-ui-color-action)]">
                  <CheckIcon />
                  <span className="sr-only">Selected</span>
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="flex h-8 cursor-default items-center justify-center text-[var(--fg-muted)]">
            <ScrollChevronIcon direction="down" />
            <span className="sr-only">Scroll to later countries</span>
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m8 10 4 4 4-4" />
    </svg>
  );
}

function ScrollChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "up" ? "m8 14 4-4 4 4" : "m8 10 4 4 4-4"} />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
