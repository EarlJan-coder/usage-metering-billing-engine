"use client";

import { useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import type { DateRange as DayPickerRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatDateRangeLabel,
  fromIsoDateString,
  toIsoDateString,
  type DateRange,
} from "@/lib/date-range";
import { cn } from "@/lib/utils";

const PRESETS: Array<{ label: string; days: number }> = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

/**
 * Date range filter (frontend-plan §7 — DateRangePicker).
 *
 * Bounds are carried as yyyy-MM-dd strings; preset dates are computed inside
 * the click handler, never during render (Next 16 static prerender ban on
 * `new Date()`).
 */
export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected: DayPickerRange = {
    from: value.from ? (fromIsoDateString(value.from) ?? undefined) : undefined,
    to: value.to ? (fromIsoDateString(value.to) ?? undefined) : undefined,
  };

  function handleSelect(range: DayPickerRange | undefined) {
    onChange({
      from: range?.from ? toIsoDateString(range.from) : null,
      to: range?.to ? toIsoDateString(range.to) : null,
    });
    // Close once both bounds are picked.
    if (range?.from && range?.to) setOpen(false);
  }

  function applyPreset(days: number) {
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - (days - 1));
    onChange({ from: toIsoDateString(from), to: toIsoDateString(to) });
    setOpen(false);
  }

  const hasValue = value.from !== null || value.to !== null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("flex items-center gap-1", className)}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2 font-normal"
            aria-label="Filter by date range"
          >
            <CalendarIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            {formatDateRangeLabel(value)}
          </Button>
        </PopoverTrigger>
        {hasValue ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear date range"
            onClick={() => onChange({ from: null, to: null })}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <PopoverContent align="start" className="w-auto p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="xs"
              onClick={() => applyPreset(preset.days)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="range"
          selected={selected}
          onSelect={handleSelect}
          numberOfMonths={2}
          captionLayout="label"
        />
      </PopoverContent>
    </Popover>
  );
}
