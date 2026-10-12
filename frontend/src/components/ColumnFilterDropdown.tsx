import { useEffect, useRef, useState } from "react";

export interface ColumnFilter {
  selected: string[];
  options: string[];
  onChange: (selected: string[]) => void;
}

interface ColumnFilterDropdownProps {
  label: string;
  filter: ColumnFilter;
}

interface PopoverPosition {
  top: number;
  left: number;
}

const POPOVER_WIDTH = 220;

export default function ColumnFilterDropdown({ label, filter }: ColumnFilterDropdownProps) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isOpen = position !== null;
  const isActive = filter.selected.length > 0;

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
        className={`column-filter-button${isActive ? " is-active" : ""}${isOpen ? " is-open" : ""}`}
        onClick={toggleOpen}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {label}
        {isActive && <span className="column-filter-count">{filter.selected.length}</span>}
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
                  type="checkbox"
                  checked={filter.selected.includes(option)}
                  onChange={() => toggleOption(option)}
                />
                <span>{option}</span>
              </label>
            ))
          )}
          {isActive && (
            <button type="button" className="column-filter-reset" onClick={() => filter.onChange([])}>
              Reset
            </button>
          )}
        </div>
      )}
    </>
  );
}
