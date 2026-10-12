import { useEffect, useRef, useState } from "react";
import type { DateRange } from "../api";

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  disabled?: boolean;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function monthRange(year: number, monthIndex: number): DateRange {
  return {
    from: toIsoDate(new Date(year, monthIndex, 1)),
    to: toIsoDate(new Date(year, monthIndex + 1, 0))
  };
}

function formatRange(range: DateRange): string {
  const from = parseIsoDate(range.from);
  const to = parseIsoDate(range.to);
  const dayMonth = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  if (range.from === range.to) {
    return `${dayMonth(from)} ${from.getFullYear()}`;
  }
  if (from.getFullYear() === to.getFullYear()) {
    return `${dayMonth(from)} – ${dayMonth(to)} ${to.getFullYear()}`;
  }
  return `${dayMonth(from)} ${from.getFullYear()} – ${dayMonth(to)} ${to.getFullYear()}`;
}

// Monday-first grid of the month, padded with nulls before the 1st.
function buildMonthDays(year: number, monthIndex: number): (string | null)[] {
  const leading = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toIsoDate(new Date(year, monthIndex, day)));
  }
  return cells;
}

export default function DateRangePicker({ value, onChange, disabled }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  // First click of a new selection; the second click completes the range.
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState(() => {
    const from = parseIsoDate(value.from);
    return { year: from.getFullYear(), month: from.getMonth() };
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open) {
      const from = parseIsoDate(value.from);
      setView({ year: from.getFullYear(), month: from.getMonth() });
      setPendingStart(null);
      setHovered(null);
    }
    setOpen((prev) => !prev);
  };

  const shiftMonth = (delta: number) => {
    setView((prev) => {
      const date = new Date(prev.year, prev.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  };

  const apply = (range: DateRange) => {
    onChange(range);
    setPendingStart(null);
    setHovered(null);
    setOpen(false);
  };

  const handleDayClick = (day: string) => {
    if (pendingStart === null) {
      setPendingStart(day);
      return;
    }
    // ISO strings compare chronologically, so a click before the start just swaps the ends.
    apply(day < pendingStart ? { from: day, to: pendingStart } : { from: pendingStart, to: day });
  };

  const today = toIsoDate(new Date());
  const now = new Date();

  // While picking, preview the range up to the hovered day; otherwise show the applied range.
  let shownFrom = value.from;
  let shownTo = value.to;
  if (pendingStart !== null) {
    const other = hovered ?? pendingStart;
    shownFrom = other < pendingStart ? other : pendingStart;
    shownTo = other < pendingStart ? pendingStart : other;
  }

  const title = new Date(view.year, view.month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const days = buildMonthDays(view.year, view.month);

  return (
    <div className="date-range-picker" ref={rootRef}>
      <span className="date-range-label">Period</span>
      <button
        type="button"
        className={`date-range-button${open ? " is-open" : ""}`}
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        </svg>
        <span>{formatRange(value)}</span>
      </button>

      {open && (
        <div className="date-range-popover" role="dialog" aria-label="Choose period">
          <div className="date-range-head">
            <button type="button" className="date-range-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7.5 3 4.5 6l3 3" />
              </svg>
            </button>
            <strong>{title}</strong>
            <button type="button" className="date-range-nav" onClick={() => shiftMonth(1)} aria-label="Next month">
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4.5 3 7.5 6l-3 3" />
              </svg>
            </button>
          </div>

          <div className="date-range-grid" onMouseLeave={() => setHovered(null)}>
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="date-range-weekday">
                {weekday}
              </span>
            ))}
            {days.map((day, index) => {
              if (day === null) {
                return <span key={`empty-${index}`} />;
              }

              const inRange = day >= shownFrom && day <= shownTo;
              const isEdge = day === shownFrom || day === shownTo;
              const className = [
                "date-range-day",
                inRange ? "in-range" : "",
                day === shownFrom ? "range-start" : "",
                day === shownTo ? "range-end" : "",
                isEdge ? "is-edge" : "",
                day === today ? "is-today" : ""
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={day}
                  type="button"
                  className={className}
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => setHovered(day)}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>

          <p className="date-range-hint">{pendingStart === null ? "Tap the first day" : "Now tap the last day"}</p>

          <div className="date-range-presets">
            <button type="button" onClick={() => apply(monthRange(now.getFullYear(), now.getMonth()))}>
              This month
            </button>
            <button type="button" onClick={() => apply(monthRange(now.getFullYear(), now.getMonth() - 1))}>
              Last month
            </button>
            <button
              type="button"
              onClick={() => apply({ from: toIsoDate(new Date(now.getFullYear(), 0, 1)), to: toIsoDate(new Date(now.getFullYear(), 11, 31)) })}
            >
              This year
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
