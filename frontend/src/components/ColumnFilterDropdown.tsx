import { useEffect, useRef, useState } from "react";

export interface ColumnFilter {
  selected: string[];
  options: string[];
  onChange: (selected: string[]) => void;
  /** Every option starts checked, and the filter only narrows rows once something is unchecked. */
  allByDefault?: boolean;
}

export function isFilterActive(filter: ColumnFilter): boolean {
  return filter.allByDefault
    ? filter.options.some((option) => !filter.selected.includes(option))
    : filter.selected.length > 0;
}

interface ColumnFilterDropdownProps {
  label: string;
  filter: ColumnFilter;
  /** Exactly one option is always selected (radio buttons, no Reset); the badge shows the chosen value. */
  single?: boolean;
  /** Adds a button under the options that closes the popover and calls this (e.g. to add a new tag). */
  onCreate?: () => void;
  createLabel?: string;
}

interface PopoverPosition {
  top: number;
  left: number;
}

const POPOVER_WIDTH = 220;

export default function ColumnFilterDropdown({
  label,
  filter,
  single = false,
  onCreate,
  createLabel = "+ New"
}: ColumnFilterDropdownProps) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isOpen = position !== null;
  const isActive = isFilterActive(filter);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const close = () => setPosition(null);
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    // The popover is position: fixed, so it would drift away from its button on scroll.
    const handleScroll = (event: Event) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        close();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [isOpen]);

  const toggleOpen = () => {
    if (isOpen || !buttonRef.current) {
      setPosition(null);
      return;
    }

    // Fixed positioning keeps the popover from being clipped by the scrollable table wrapper.
    const rect = buttonRef.current.getBoundingClientRect();
    const maxLeft = window.innerWidth - POPOVER_WIDTH - 8;
    setPosition({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, maxLeft)) });
  };

  const toggleOption = (option: string) => {
    if (single) {
      filter.onChange([option]);
      setPosition(null);
      return;
    }

    filter.onChange(
      filter.selected.includes(option)
        ? filter.selected.filter((value) => value !== option)
        : [...filter.selected, option]
    );
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`column-filter-button${isActive && !single ? " is-active" : ""}${isOpen ? " is-open" : ""}`}
        onClick={toggleOpen}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {label}
        {isActive && <span className="column-filter-count">{single ? filter.selected[0] : filter.selected.length}</span>}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      {position && (
        <div
          ref={popoverRef}
          className="column-filter-popover"
          style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
          role="dialog"
          aria-label={`Filter by ${label}`}
        >
          {filter.options.length === 0 ? (
            <p className="column-filter-empty">No values</p>
          ) : (
            filter.options.map((option) => (
              <label key={option} className="column-filter-option">
                <input
                  type={single ? "radio" : "checkbox"}
                  checked={filter.selected.includes(option)}
                  onChange={() => toggleOption(option)}
                />
                <span>{option}</span>
              </label>
            ))
          )}
          {isActive && !single && (
            <button type="button" className="column-filter-reset" onClick={() => filter.onChange(filter.allByDefault ? filter.options : [])}>
              Reset
            </button>
          )}
          {onCreate && (
            <button
              type="button"
              className="column-filter-reset"
              onClick={() => {
                setPosition(null);
                onCreate();
              }}
            >
              {createLabel}
            </button>
          )}
        </div>
      )}
    </>
  );
}
