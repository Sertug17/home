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
};

export function CountrySelect({
  value,
  onValueChange,
  describedBy,
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
        className="flex min-h-[47px] w-full items-center justify-between rounded-[2px] border border-[#b1b7c3] bg-white px-[13px] text-left text-[0.9rem] font-semibold text-[#0a0b0d] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0000ff] data-[state=open]:border-[#0000ff]"
      >
        <Select.Value />
        <Select.Icon aria-hidden="true" className="ml-3 shrink-0 text-[#32353d]">
          <ChevronIcon />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[4px] border border-[#b1b7c3] bg-white p-1 text-[#0a0b0d]"
        >
          <Select.Viewport>
            {regionIds.map((id) => (
              <Select.Item
                key={id}
                value={id}
                className="relative flex min-h-10 w-full cursor-default select-none items-center rounded-[2px] py-2 pl-3 pr-9 text-left text-sm font-semibold outline-none data-[highlighted]:bg-[#eef0f3] data-[state=checked]:bg-[#eef0f3]"
              >
                <Select.ItemText>
                  {presentationRegions[id].selectorLabel}
                </Select.ItemText>
                <Select.ItemIndicator className="absolute right-3 inline-flex items-center text-[#0000ff]">
                  <CheckIcon />
                  <span className="sr-only">Selected</span>
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
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
