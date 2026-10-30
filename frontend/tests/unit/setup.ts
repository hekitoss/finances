import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, vi } from "vitest";

// jsdom has no layout, so ResponsiveContainer would measure 0×0 and draw nothing: give the chart a fixed size,
// and draw the pie without its animation so sectors and labels are there right away.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const Pie = actual.Pie as unknown as { defaultProps: Record<string, unknown> };
  Pie.defaultProps = { ...Pie.defaultProps, isAnimationActive: false };
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      createElement(
        "div",
        { style: { width: 600, height: 360 } },
        isValidElement(children) ? cloneElement(children as ReactElement, { width: 600, height: 360 }) : children
      )
  };
});

/** Wide screen by default; a test can call this to emulate a phone (the table's 640px breakpoint). */
export function setNarrowScreen(narrow: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: narrow && query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    }) as MediaQueryList;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  setNarrowScreen(false);
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
